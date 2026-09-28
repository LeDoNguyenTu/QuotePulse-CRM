export default { promises: { open: async () => { throw new Error('Filesystem paths are unavailable in the browser.'); } } };
