import { diffCommandsCatalog } from './commands-catalog-history.util';

describe('commands-catalog-history.util', () => {
  it('returns empty array when diffing empty or invalid catalog objects', () => {
    expect(diffCommandsCatalog(null, null)).toEqual([]);
    expect(diffCommandsCatalog({}, {})).toEqual([]);
    expect(diffCommandsCatalog('invalid', [])).toEqual([]);
  });

  it('detects category creation and newly added commands inside it', () => {
    const before = {
      categories: {},
    };
    const after = {
      categories: {
        admin: {
          name: 'Admin Commands',
          commands: [
            { id: 'kick', name: 'Kick Player', command: '/kick {player}' },
            { id: 'ban', name: 'Ban Player', command: '/ban {player}' },
          ],
        },
      },
    };

    const changes = diffCommandsCatalog(before, after);
    expect(changes).toEqual([
      {
        action: 'category_create',
        target: 'Admin Commands',
        detail: { key: 'admin' },
      },
      {
        action: 'command_create',
        target: 'Kick Player',
        detail: {
          id: 'kick',
          command: '/kick {player}',
          category: 'Admin Commands',
          category_key: 'admin',
        },
      },
      {
        action: 'command_create',
        target: 'Ban Player',
        detail: {
          id: 'ban',
          command: '/ban {player}',
          category: 'Admin Commands',
          category_key: 'admin',
        },
      },
    ]);
  });

  it('detects category deletion with its commands', () => {
    const before = {
      categories: {
        debug: {
          name: 'Debug',
          commands: [{ id: 'perf', name: 'Performance', command: '/perf' }],
        },
      },
    };
    const after = {
      categories: {},
    };

    const changes = diffCommandsCatalog(before, after);
    expect(changes).toEqual([
      {
        action: 'category_delete',
        target: 'Debug',
        detail: {
          key: 'debug',
          commands: ['Performance'],
        },
      },
    ]);
  });

  it('detects command additions and deletions within existing categories', () => {
    const before = {
      categories: {
        server: {
          name: 'Server',
          commands: [
            { id: 'save', name: 'Save Game', command: '/server-save' },
            { id: 'old_cmd', name: 'Old Command', command: '/old' },
          ],
        },
      },
    };
    const after = {
      categories: {
        server: {
          name: 'Server',
          commands: [
            { id: 'save', name: 'Save Game', command: '/server-save' },
            { id: 'restart', name: 'Restart Game', command: '/restart' },
          ],
        },
      },
    };

    const changes = diffCommandsCatalog(before, after);
    expect(changes).toEqual([
      {
        action: 'command_create',
        target: 'Restart Game',
        detail: {
          id: 'restart',
          command: '/restart',
          category: 'Server',
          category_key: 'server',
        },
      },
      {
        action: 'command_delete',
        target: 'Old Command',
        detail: {
          id: 'old_cmd',
          command: '/old',
          category: 'Server',
          category_key: 'server',
        },
      },
    ]);
  });

  it('handles commands without names falling back to their id', () => {
    const before = {
      categories: {
        cat1: {
          name: '',
          commands: [{ id: 'cmd1', command: '/test' }],
        },
      },
    };
    const after = {
      categories: {
        cat1: {
          name: '',
          commands: [],
        },
      },
    };

    const changes = diffCommandsCatalog(before, after);
    expect(changes).toEqual([
      {
        action: 'command_delete',
        target: 'cmd1',
        detail: {
          id: 'cmd1',
          command: '/test',
          category: 'cat1',
          category_key: 'cat1',
        },
      },
    ]);
  });
});
