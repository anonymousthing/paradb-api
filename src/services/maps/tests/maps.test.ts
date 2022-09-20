import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as fs from 'fs/promises';
import { testAuthenticate, testPost } from 'jest_helpers';
import { deserializeSubmitMapResponse, serializeSubmitMapRequest } from 'paradb-api-schema';
import * as path from 'path';

describe('maps handler', () => {
  const testMapUpload = async (mapPath: string) => {
    const cookie = await testAuthenticate();
    const testMap = await fs.readFile(path.resolve(__dirname, mapPath));
    return testPost('/api/maps/submit', serializeSubmitMapRequest, deserializeSubmitMapResponse, {
      mapData: new Uint8Array(testMap.buffer),
    }, cookie);
  };

  it('allows users to submit maps', async () => {
    const s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    const resp = await testMapUpload('files/Test_valid.zip');
    expect(resp).toEqual({ success: true, id: expect.stringMatching(/^M[0-9A-F]{6}$/) });

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  it('allows maps that have a different folder name to the song title, as long as it matches the rlrr files', async () => {
    const s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    const resp = await testMapUpload('files/Test_valid_different_folder_name.zip');
    expect(resp).toEqual({ success: true, id: expect.stringMatching(/^M[0-9A-F]{6}$/) });

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  describe('fails when', () => {
    it('has mismatched metadata in each rlrr', async () => {
      const resp = await testMapUpload('files/Test_different_metadata.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage: 'All difficulties need to have identical metadata (excluding complexity)',
      });
    });

    it('has an incorrectly named root folder', async () => {
      const resp = await testMapUpload('files/Test_incorrect_folder_name.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage: 'The top-level folder name needs to match the names of the rlrr files',
      });
    });

    it('has no top-level folder', async () => {
      const resp = await testMapUpload('files/Test_missing_folder.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage:
          'Incorrect folder structure. There needs to be exactly one top-level folder containing all of the files, and the folder needs to match the song title.',
      });
    });

    it('is missing the album art file', async () => {
      const resp = await testMapUpload('files/Test_missing_album_art.zip');
      expect(resp).toEqual({ success: false, statusCode: 400, errorMessage: 'Missing album art' });
    });

    it('is corrupted, or an unsupported archive format', async () => {
      const resp = await testMapUpload('files/Test_invalid_archive.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage: 'Invalid map archive; could not find map data',
      });
    });

    it('has no rlrr files', async () => {
      const resp = await testMapUpload('files/Test_missing_rlrr.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage: 'Invalid map archive; could not find map data',
      });
    });

    it('has a corrupted or incorrectly formatted rlrr file', async () => {
      const resp = await testMapUpload('files/Test_invalid_rlrr.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage: 'Invalid map data; could not process the map .rlrr files',
      });
    });

    it('is missing a required field in the rlrr file', async () => {
      const resp = await testMapUpload('files/Test_missing_title.zip');
      expect(resp).toEqual({
        success: false,
        statusCode: 400,
        errorMessage:
          'Invalid map data; a map .rlrr is missing a required field (title, artist or complexity)',
      });
    });
  });
});
