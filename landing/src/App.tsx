import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { dictionaries, languageLabels, supportedLanguages, type Dictionary, type Feature, type Lang } from './content';
import { SCENES } from './assets/manifest';

type CinematicState = {
  progress: number;
  act: number;
  actProgress: number;
  opacities: number[];
};

const actStops = [0, 0.095, 0.17, 0.37, 0.55, 0.72, 0.84, 1];
const sceneTransitions = [0.125, 0.245, 0.435, 0.625, 0.865];
const sceneAnchors = [0, 0.16, 0.32, 0.53, 0.72, 0.96];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;

function getInitialLanguage(): Lang {
  try {
    const saved = localStorage.getItem('tradejournal-landing-lang') as Lang | null;
    if (saved && supportedLanguages.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }

  const browser = navigator.language.slice(0, 2) as Lang;
  return supportedLanguages.includes(browser) ? browser : 'en';
}

function useCinematicScroll(): CinematicState {
  const [state, setState] = useState<CinematicState>({
    progress: 0,
    act: 0,
    actProgress: 0,
    opacities: [1, 0, 0, 0, 0, 0],
  });

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = clamp(window.scrollY / maxScroll);
      let act = actStops.length - 2;

      for (let index = 0; index < actStops.length - 1; index += 1) {
        if (progress >= actStops[index] && progress < actStops[index + 1]) {
          act = index;
          break;
        }
      }

      const actProgress = clamp((progress - actStops[act]) / (actStops[act + 1] - actStops[act]));
      let currentScene = 0;
      sceneTransitions.forEach((transition) => {
        if (progress >= transition) currentScene += 1;
      });

      const opacities = Array(SCENES.length).fill(0);
      opacities[currentScene] = 1;

      sceneTransitions.forEach((transition, index) => {
        const width = index === 3 ? 0.018 : 0.032;
        if (progress >= transition - width && progress <= transition + width) {
          const mix = clamp((progress - (transition - width)) / (width * 2));
          opacities[index] = 1 - mix;
          opacities[index + 1] = mix;
        }
      });

      document.documentElement.style.setProperty('--page-progress', String(progress));
      setState({ progress, act, actProgress, opacities });
      frame = 0;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const pointer = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      document.documentElement.style.setProperty('--pointer-x', x.toFixed(3));
      document.documentElement.style.setProperty('--pointer-y', y.toFixed(3));
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pointermove', pointer, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', pointer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}

function useReveals() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function SceneStack({ dictionary, state, onReady }: { dictionary: Dictionary; state: CinematicState; onReady: () => void }) {
  return (
    <div className="scene-stack">
      {SCENES.map((scene, index) => {
        const distance = state.progress - sceneAnchors[index];
        const style = {
          '--scene-opacity': state.opacities[index],
          '--scene-scale': (1.045 + Math.min(Math.abs(distance), 0.2) * 0.08).toFixed(4),
          '--scene-shift': `${clamp(distance * -10, -2.5, 2.5)}%`,
        } as CSSProperties;

        return (
          <picture className="scene" style={style} key={scene.id}>
            <source media="(max-width: 900px)" srcSet={assetUrl(scene.portrait)} />
            <img
              src={assetUrl(scene.still)}
              alt={dictionary.scenes[index]}
              loading={index < 2 ? 'eager' : 'lazy'}
              onLoad={index === 0 ? onReady : undefined}
            />
          </picture>
        );
      })}
      <div className="scene-grade" />
      <div className="scene-grain" />
    </div>
  );
}

function FallbackScene({ dictionary, index }: { dictionary: Dictionary; index: number }) {
  const scene = SCENES[index];
  return (
    <picture className="fallback-scene">
      <source media="(max-width: 900px)" srcSet={assetUrl(scene.portrait)} />
      <img src={assetUrl(scene.still)} alt={dictionary.scenes[index]} loading="lazy" />
    </picture>
  );
}

function Header({ dictionary, lang, onLanguage }: { dictionary: Dictionary; lang: Lang; onLanguage: (lang: Lang) => void }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="#hero" aria-label="NAVRYA Hunter">
        <span className="wordmark-mark" aria-hidden="true">N</span>
        <span>
          <strong>NAVRYA</strong>
          <small>{dictionary.nav.fieldManual}</small>
        </span>
      </a>
      <div className="header-actions">
        <label className="language-select">
          <span className="sr-only">{dictionary.nav.language}</span>
          <select value={lang} onChange={(event) => onLanguage(event.target.value as Lang)} aria-label={dictionary.nav.language}>
            {supportedLanguages.map((item) => (
              <option value={item} key={item}>{languageLabels[item]}</option>
            ))}
          </select>
        </label>
        <a className="journal-link" href="../">{dictionary.nav.openJournal}<span aria-hidden="true">↗</span></a>
      </div>
    </header>
  );
}

function BowstringRail({ dictionary, state }: { dictionary: Dictionary; state: CinematicState }) {
  const draw = state.act === 2 ? Math.sin(state.actProgress * Math.PI) * 48 : 0;
  const markerY = 78 + state.progress * 744;
  const links = [
    { id: 'hero', label: 'Hunter' },
    { id: 'opening', label: dictionary.rail[0] },
    { id: 'draw', label: dictionary.rail[1] },
    { id: 'flight', label: dictionary.rail[2] },
    { id: 'miss', label: dictionary.rail[3] },
    { id: 'field', label: dictionary.rail[4] },
    { id: 'long-hunt', label: dictionary.rail[5] },
  ];

  return (
    <nav className="bowstring" aria-label={dictionary.nav.fieldManual}>
      <svg viewBox="0 0 112 900" preserveAspectRatio="none" aria-hidden="true">
        <path className="bowstring-path" d={`M 28 64 Q ${28 + draw} 450 28 836`} />
        <line className="bowstring-arrow" x1={28 + draw * 0.86} y1={markerY} x2={78 + draw * 0.36} y2={markerY} />
        <circle className="bowstring-nock" cx={28 + draw * Math.sin((markerY / 900) * Math.PI)} cy={markerY} r="4" />
        {state.act >= 4 && <line className="impact-tick" x1="20" x2="38" y1={markerY} y2={markerY} />}
      </svg>
      <span className="rail-readout">{dictionary.common.act} {String(state.act).padStart(2, '0')}</span>
      <div className="rail-links">
        {links.map((link, index) => (
          <a href={`#${link.id}`} key={link.id} style={{ '--tick': index / (links.length - 1) } as CSSProperties}>
            <span aria-hidden="true" />
            <em>{link.label}</em>
          </a>
        ))}
      </div>
    </nav>
  );
}

function MobileProgress() {
  return <div className="mobile-progress" aria-hidden="true"><span /></div>;
}

function FeatureCard({ feature, layout = 'default' }: { feature: Feature; layout?: 'default' | 'flight' }) {
  return (
    <article className={`feature-card feature-card--${layout}${feature.rust ? ' feature-card--rust' : ''}`} data-reveal>
      <div className="feature-index">
        <span>{feature.number}</span>
        <small>{feature.label}</small>
      </div>
      <h3>{feature.title}</h3>
      <p>{feature.body}</p>
      <div className="proof-chip"><span aria-hidden="true" />{feature.proof}</div>
    </article>
  );
}

function LanguageChips({ lang, onLanguage }: { lang: Lang; onLanguage: (lang: Lang) => void }) {
  return (
    <div className="language-chips" role="group" aria-label="Languages">
      {supportedLanguages.map((item) => (
        <button key={item} type="button" className={item === lang ? 'is-active' : ''} onClick={() => onLanguage(item)}>
          {languageLabels[item]}
        </button>
      ))}
    </div>
  );
}

function DeviceShowcase({ dictionary }: { dictionary: Dictionary }) {
  return (
    <div className="device-showcase" data-reveal>
      <div className="desktop-device">
        <div className="device-topbar">
          <span className="device-brand">N</span>
          <span>{dictionary.field.desktopLabel}</span>
          <i />
        </div>
        <div className="desktop-ui">
          <aside>
            <b>{dictionary.field.session}</b>
            <span>{dictionary.field.probability}</span>
            <span>{dictionary.field.pattern}</span>
            <span>{dictionary.field.review}</span>
          </aside>
          <main>
            <div className="ui-rings"><i /><i /><i /></div>
            <div className="ui-chart" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="ui-timeline"><i /><i /><i /><i /></div>
          </main>
        </div>
      </div>
      <div className="phone-device">
        <div className="phone-sensor" />
        <small>{dictionary.field.mobileLabel}</small>
        <strong>BTC / USDT</strong>
        <div className="phone-steps"><span>01</span><span>02</span><span>03</span></div>
        <div className="emotion-bars"><i /><i /><i /></div>
        <button type="button" tabIndex={-1}>{dictionary.field.review}</button>
      </div>
    </div>
  );
}

function XPLadder({ dictionary }: { dictionary: Dictionary }) {
  return (
    <ol className="xp-ladder" data-reveal>
      {dictionary.long.levels.map((level, index) => (
        <li key={level}>
          <span className="xp-node">{index + 1}</span>
          <strong>{level}</strong>
          <small>{dictionary.long.thresholds[index]} XP</small>
        </li>
      ))}
    </ol>
  );
}

function ActHeader({ act, title, line, large = false }: { act: string; title: string; line: string; large?: boolean }) {
  return (
    <header className={`act-header${large ? ' act-header--large' : ''}`} data-reveal>
      <span className="act-label">{act}</span>
      <h2>{title}</h2>
      <p>{line}</p>
    </header>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(getInitialLanguage);
  const [ready, setReady] = useState(false);
  const dictionary = useMemo(() => dictionaries[lang], [lang]);
  const state = useCinematicScroll();
  useReveals();

  useEffect(() => {
    const direction = lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = direction;
    document.title = lang === 'fa' ? 'NAVRYA · دفتر شکارچی' : 'NAVRYA · The Hunter Record';
    try {
      localStorage.setItem('tradejournal-landing-lang', lang);
    } catch {
      // The language still updates for this visit when storage is unavailable.
    }
  }, [lang]);

  return (
    <div className={`site-shell${ready ? ' is-ready' : ''}`}>
      <a className="skip-link" href="#opening">{dictionary.skip}</a>
      <div className="preloader" aria-hidden={ready}>
        <span />
        <small>NAVRYA · HUNTER</small>
      </div>
      <SceneStack dictionary={dictionary} state={state} onReady={() => setReady(true)} />
      <Header dictionary={dictionary} lang={lang} onLanguage={setLang} />
      <BowstringRail dictionary={dictionary} state={state} />
      <MobileProgress />

      <main id="field-manual" className="content-layer">
        <section className="beat beat--hero" id="hero">
          <FallbackScene dictionary={dictionary} index={0} />
          <div className="hero-copy" data-reveal>
            <span className="act-label">{dictionary.hero.eyebrow}</span>
            <h1><span>{dictionary.hero.line1}</span><span>{dictionary.hero.line2}</span></h1>
            <p className="hero-body">{dictionary.hero.body}</p>
            <div className="hero-actions">
              <a className="button button--primary" href="../">{dictionary.hero.primary}<span aria-hidden="true">↗</span></a>
              <a className="button button--ghost" href="#opening">{dictionary.hero.secondary}<span aria-hidden="true">↓</span></a>
            </div>
            <blockquote>
              <small>{dictionary.hero.thesisLabel}</small>
              <p>{dictionary.hero.thesis}</p>
            </blockquote>
          </div>
        </section>

        <section className="beat beat--opening" id="opening">
          <FallbackScene dictionary={dictionary} index={1} />
          <ActHeader act={dictionary.opening.act} title={dictionary.opening.title} line={dictionary.opening.line} />
        </section>

        <section className="beat beat--draw" id="draw">
          <FallbackScene dictionary={dictionary} index={2} />
          <div className="beat-column beat-column--end">
            <ActHeader act={dictionary.draw.act} title={dictionary.draw.title} line={dictionary.draw.line} />
            <div className="feature-stack">
              {dictionary.draw.features.map((feature) => <FeatureCard feature={feature} key={feature.number} />)}
            </div>
          </div>
        </section>

        <section className="beat beat--flight" id="flight">
          <FallbackScene dictionary={dictionary} index={3} />
          <ActHeader act={dictionary.flight.act} title={dictionary.flight.title} line={dictionary.flight.line} />
          <div className="flight-features">
            <FeatureCard feature={dictionary.flight.features[0]} layout="flight" />
            <div className="flight-horizon" aria-hidden="true"><i /><span>VELOCITY / RECORD</span></div>
            <FeatureCard feature={dictionary.flight.features[1]} layout="flight" />
          </div>
        </section>

        <section className="beat beat--miss" id="miss">
          <FallbackScene dictionary={dictionary} index={4} />
          <div className="miss-impact">
            <ActHeader act={dictionary.miss.act} title={dictionary.miss.title} line={dictionary.miss.line} large />
          </div>
          <div className="beat-column beat-column--start miss-features">
            {dictionary.miss.features.map((feature) => <FeatureCard feature={feature} key={feature.number} />)}
          </div>
        </section>

        <section className="beat beat--field" id="field">
          <FallbackScene dictionary={dictionary} index={4} />
          <div className="field-grid">
            <div>
              <ActHeader act={dictionary.field.act} title={dictionary.field.title} line={dictionary.field.line} />
              <div className="field-facts" data-reveal>
                <strong>{dictionary.field.local}</strong>
                <p>{dictionary.field.browser}</p>
              </div>
              <LanguageChips lang={lang} onLanguage={setLang} />
            </div>
            <DeviceShowcase dictionary={dictionary} />
          </div>
        </section>

        <section className="beat beat--long" id="long-hunt">
          <FallbackScene dictionary={dictionary} index={5} />
          <div className="long-grid">
            <div>
              <ActHeader act={dictionary.long.act} title={dictionary.long.title} line={dictionary.long.body} />
              <p className="mastery-gate" data-reveal>{dictionary.long.gate}</p>
              <FeatureCard feature={dictionary.long.contribution} />
            </div>
            <XPLadder dictionary={dictionary} />
          </div>
          <aside className="honesty-note" data-reveal>
            <span className="act-label">{dictionary.long.honestyTitle}</span>
            <p>{dictionary.long.marketplace}</p>
            <p>{dictionary.long.ai}</p>
          </aside>
          <div className="closing-cta" data-reveal>
            <p>{dictionary.hero.thesis}</p>
            <div className="hero-actions">
              <a className="button button--primary" href="../">{dictionary.long.primary}<span aria-hidden="true">↗</span></a>
              <a className="button button--ghost" href="#hero">{dictionary.long.secondary}<span aria-hidden="true">↑</span></a>
            </div>
          </div>
          <footer className="site-footer">
            <span>NAVRYA · HUNTER</span>
            <p>{dictionary.long.foot}</p>
            <span>© {new Date().getFullYear()} NAVRYA</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
