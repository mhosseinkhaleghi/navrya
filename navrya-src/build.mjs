// Builds the NAVRYA bundle for all four characters. Uses Vite's JS API in a loop (rather than
// shelling out to `vite build` four times with an inline env-var prefix) so this works
// identically under bash and PowerShell/cmd.exe, since inline `VAR=value command` syntax isn't
// portable to Windows shells.
import { build } from 'vite';

const CHARACTERS = ['hunter', 'commander', 'engineer', 'sage'];

for (const character of CHARACTERS) {
  process.env.NAVRYA_CHARACTER = character;
  await build({ configFile: 'vite.navrya.config.mjs' });
}
