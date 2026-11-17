import { describe, expect, it } from 'vitest';
import { zipName, zipPath, zipUrl } from './zip';

describe('zip paths', () => {
  it('cleans an absolute folder path', () => {
    expect(zipPath(' /home//me/ ')).toBe('/home/me');
    expect(zipPath('/root')).toBe('/root');
  });
  it('refuses relative, root, dot parts and unsafe characters', () => {
    for (const bad of ['', 'home', '/', '//', '/home/../etc', '/./x', '/a\\b', '/a%2f', '/a\u0000', '/' + 'x'.repeat(1024)]) expect(zipPath(bad)).toBeNull();
  });
  it('builds the address from the program base, each part encoded', () => {
    expect(zipUrl('https://p-c-files-1.n1.example/', '/home/my dir/ü')).toBe('https://p-c-files-1.n1.example/api/v1/files/home/my%20dir/%C3%BC?zip');
    expect(zipUrl('', '/root')).toBe('');
    expect(zipUrl('http://x', '/root')).toBe('');
  });
  it('a top folder the files program would read as a command is written with its first letter encoded (core filesUrl)', () => {
    const base = 'https://p-c-files-1.n1.example';
    expect(zipUrl(base, '/stat')).toBe(base + '/api/v1/files/%73tat?zip');
    expect(zipUrl(base, '/glob/x')).toBe(base + '/api/v1/files/%67lob/x?zip');
    expect(zipUrl(base, '/realpath/a b')).toBe(base + '/api/v1/files/%72ealpath/a%20b?zip');
    expect(zipUrl(base, '/health')).toBe(base + '/api/v1/files/%68ealth?zip');
    // core writes every first part named like an alias or the health check so (the program decodes it back)
    expect(zipUrl(base, '/health/logs')).toBe(base + '/api/v1/files/%68ealth/logs?zip');
    expect(zipUrl(base, '/status')).toBe(base + '/api/v1/files/status?zip');
    // only the first part
    expect(zipUrl(base, '/home/stat')).toBe(base + '/api/v1/files/home/stat?zip');
  });
  it('names the archive after the folder', () => {
    expect(zipName('/home/me')).toBe('me.zip');
  });
});
