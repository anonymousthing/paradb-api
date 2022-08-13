import * as fs from 'fs/promises';
import { testAuthenticate, testPost } from 'jest_helpers';
import { deserializeSubmitMapResponse, serializeSubmitMapRequest } from 'paradb-api-schema';
import * as path from 'path';

describe('maps handler', () => {
  it('allows users to submit maps', async () => {
    const cookie = await testAuthenticate();
    const testMap = await fs.readFile(path.resolve(__dirname, 'files/Test.zip'));
    const resp = await testPost(
      '/api/maps/submit',
      serializeSubmitMapRequest,
      deserializeSubmitMapResponse,
      { mapData: new Uint8Array(testMap.buffer) },
      cookie,
    );
    expect(resp).toEqual({ success: true, id: expect.stringMatching(/^M[0-9A-F]{6}$/) });
  });
});
