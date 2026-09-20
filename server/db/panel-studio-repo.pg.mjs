// PostgreSQL implementation of the Vibe Coding Panel Studio artifact/revision repository domain
// (076_panel_studio_artifacts.sql). Mirrors server/db/panel-studio-repo.memory.mjs method-for-
// method (same names, arguments, and result shapes) so route handlers and tests behave
// identically regardless of which backend is injected - the same convention every other domain
// in this repo (e.g. supportTickets, conversationScenarios) already follows.
//
// createRevision() is the one method that matters most: it is the ONLY way a revision is ever
// created, whether the source came from a real AI generation, a manual edit, or a restore - the
// caller only differs in what `sourceKind`/`prompt`/`provider` etc. it passes. It always inserts
// a brand-new row and never mutates a past one (revision history is append-only by construction),
// and it uses a `SELECT ... FOR UPDATE` row lock plus an explicit
// `current_revision_id === baseRevisionId` precondition check to implement the optimistic-
// concurrency contract the API exposes as `baseRevisionId` - the same pessimistic-lock-plus-
// precondition idiom conversationScenarios.publish()/rollback() already use elsewhere in this
// file family, rather than a client-side ETag/If-Match mechanism this codebase has never used.
//
// Wired in from createPgRepo() (server/db/repo.pg.mjs) with just the pool and newId.
import { ApiError } from '../community/errors.mjs';

const VALID_TARGETS = ['dashboard.panel'];
const VALID_SOURCE_KINDS = ['generated', 'manual-edit', 'restore'];

const iso = (value) => (value ? new Date(value).toISOString() : null);

function mapArtifact(r) {
  return {
    id: r.id, userId: r.user_id, target: r.target, title: r.title, status: r.status,
    currentRevisionId: r.current_revision_id, appliedRevisionId: r.applied_revision_id,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  };
}

function mapRevision(r) {
  return {
    id: r.id, artifactId: r.artifact_id, revisionNumber: r.revision_number, source: r.source,
    sourceKind: r.source_kind, prompt: r.prompt, restoredFromRevisionId: r.restored_from_revision_id,
    provider: r.provider, model: r.model, codingEngineId: r.coding_engine_id,
    createdBy: r.created_by, createdAt: iso(r.created_at)
  };
}

export function createPanelStudioPgDomains({ pool, newId }) {
  const panelStudioArtifacts = {
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM panel_studio_artifacts WHERE id=$1', [id]);
      return rows[0] ? mapArtifact(rows[0]) : null;
    },
    async listForUser(userId, { status } = {}) {
      const params = [userId];
      let text = 'SELECT * FROM panel_studio_artifacts WHERE user_id=$1';
      if (status) { params.push(status); text += ` AND status=$${params.length}`; }
      text += ' ORDER BY updated_at DESC';
      const { rows } = await pool.query(text, params);
      return rows.map(mapArtifact);
    },
    async listRevisions(artifactId) {
      const { rows } = await pool.query('SELECT * FROM panel_studio_revisions WHERE artifact_id=$1 ORDER BY revision_number DESC', [artifactId]);
      return rows.map(mapRevision);
    },
    async getRevision(revisionId) {
      const { rows } = await pool.query('SELECT * FROM panel_studio_revisions WHERE id=$1', [revisionId]);
      return rows[0] ? mapRevision(rows[0]) : null;
    },
    async createRevision({ userId, artifactId, target, title, source, sourceKind, prompt, restoredFromRevisionId, provider, model, codingEngineId, baseRevisionId, createdBy }) {
      if (!VALID_SOURCE_KINDS.includes(sourceKind)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'sourceKind' });
      if (!source) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'source' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let artifactRow;
        if (!artifactId) {
          if (baseRevisionId) throw new ApiError(409, 'REVISION_CONFLICT');
          if (!VALID_TARGETS.includes(target)) throw new ApiError(400, 'PANEL_STUDIO_TARGET_UNSUPPORTED');
          const { rows: [row] } = await client.query(
            `INSERT INTO panel_studio_artifacts (id, user_id, target, title) VALUES ($1,$2,$3,$4) RETURNING *`,
            [newId('panelart'), userId, target, String(title || 'Untitled panel').slice(0, 120)]
          );
          artifactRow = row;
        } else {
          const { rows } = await client.query('SELECT * FROM panel_studio_artifacts WHERE id=$1 FOR UPDATE', [artifactId]);
          artifactRow = rows[0];
          if (!artifactRow) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
          if (artifactRow.user_id !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
          if (artifactRow.status === 'archived') throw new ApiError(400, 'ARTIFACT_ARCHIVED');
          if ((artifactRow.current_revision_id || null) !== (baseRevisionId || null)) throw new ApiError(409, 'REVISION_CONFLICT');
        }
        const { rows: [{ next }] } = await client.query(
          'SELECT COALESCE(MAX(revision_number),0) + 1 AS next FROM panel_studio_revisions WHERE artifact_id=$1',
          [artifactRow.id]
        );
        const { rows: [revisionRow] } = await client.query(
          `INSERT INTO panel_studio_revisions
             (id, artifact_id, revision_number, source, source_kind, prompt, restored_from_revision_id, provider, model, coding_engine_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [newId('panelrev'), artifactRow.id, next, source, sourceKind, prompt || null, restoredFromRevisionId || null,
            provider || null, model || null, codingEngineId || null, createdBy]
        );
        const nextStatus = artifactRow.status === 'applied' ? 'applied' : 'ready';
        const { rows: [updatedArtifact] } = await client.query(
          `UPDATE panel_studio_artifacts SET current_revision_id=$2, status=$3, updated_at=now() WHERE id=$1 RETURNING *`,
          [artifactRow.id, revisionRow.id, nextStatus]
        );
        await client.query('COMMIT');
        return { artifact: mapArtifact(updatedArtifact), revision: mapRevision(revisionRow) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async apply(artifactId, userId, revisionId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM panel_studio_artifacts WHERE id=$1 FOR UPDATE', [artifactId]);
        const artifact = rows[0];
        if (!artifact) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
        if (artifact.user_id !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
        if (artifact.status === 'archived') throw new ApiError(400, 'ARTIFACT_ARCHIVED');
        const targetRevisionId = revisionId || artifact.current_revision_id;
        if (!targetRevisionId) throw new ApiError(400, 'NO_REVISION_TO_APPLY');
        const { rows: revRows } = await client.query('SELECT * FROM panel_studio_revisions WHERE id=$1 AND artifact_id=$2', [targetRevisionId, artifactId]);
        if (!revRows[0]) throw new ApiError(404, 'REVISION_NOT_FOUND');
        const { rows: [updated] } = await client.query(
          `UPDATE panel_studio_artifacts SET applied_revision_id=$2, status='applied', updated_at=now() WHERE id=$1 RETURNING *`,
          [artifactId, targetRevisionId]
        );
        await client.query('COMMIT');
        return mapArtifact(updated);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async archive(artifactId, userId) {
      const { rows } = await pool.query('SELECT * FROM panel_studio_artifacts WHERE id=$1', [artifactId]);
      if (!rows[0]) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
      const { rows: [updated] } = await pool.query(`UPDATE panel_studio_artifacts SET status='archived', updated_at=now() WHERE id=$1 RETURNING *`, [artifactId]);
      return mapArtifact(updated);
    },
    async unarchive(artifactId, userId) {
      const { rows } = await pool.query('SELECT * FROM panel_studio_artifacts WHERE id=$1', [artifactId]);
      if (!rows[0]) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
      if (rows[0].status !== 'archived') throw new ApiError(400, 'ARTIFACT_NOT_ARCHIVED');
      // Recomputed from the artifact's own real pointers - never assumed - so an artifact that was
      // applied before it was archived comes back as 'applied', not silently demoted to 'ready'.
      const nextStatus = rows[0].applied_revision_id ? 'applied' : rows[0].current_revision_id ? 'ready' : 'draft';
      const { rows: [updated] } = await pool.query(`UPDATE panel_studio_artifacts SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`, [artifactId, nextStatus]);
      return mapArtifact(updated);
    }
  };

  return { panelStudioArtifacts };
}
