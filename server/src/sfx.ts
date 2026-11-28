// Sound effects are played from the server's own sound library (server/src/library.ts); sounds without a library take
// are made by the browser. What is left here is the switch for effects as a whole.
export const sfxEnabled = (env: NodeJS.ProcessEnv) => (env.HEARTHFORGE_SFX ?? 'on').toLowerCase() !== 'off';
