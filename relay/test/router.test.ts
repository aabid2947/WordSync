import { describe, expect, it } from 'vitest';
import { corsHeaders, matchRoute } from '../src/router';

const tok = 'a'.repeat(36);

describe('matchRoute', () => {
  it('matches create-session', () => {
    expect(matchRoute('POST', '/create-session')).toEqual({ name: 'create' });
  });

  it('matches the upload page (GET) and upload (POST)', () => {
    expect(matchRoute('GET', `/u/${tok}`)).toEqual({ name: 'uploadPage', token: tok });
    expect(matchRoute('POST', `/u/${tok}`)).toEqual({ name: 'upload', token: tok });
  });

  it('matches poll (GET)', () => {
    expect(matchRoute('GET', `/session/${tok}`)).toEqual({ name: 'poll', token: tok });
  });

  it('rejects an invalid token', () => {
    expect(matchRoute('GET', '/u/not!a!token').name).toBe('notFound');
    expect(matchRoute('GET', '/session/..').name).toBe('notFound');
  });

  it('rejects unknown paths and methods', () => {
    expect(matchRoute('GET', '/').name).toBe('notFound');
    expect(matchRoute('DELETE', `/u/${tok}`).name).toBe('notFound');
    expect(matchRoute('GET', '/create-session').name).toBe('notFound');
  });
});

describe('corsHeaders', () => {
  it('echoes the caller origin, falling back to *', () => {
    expect(corsHeaders('chrome-extension://abc')['Access-Control-Allow-Origin']).toBe(
      'chrome-extension://abc',
    );
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBe('*');
  });
});
