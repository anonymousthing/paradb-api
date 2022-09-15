import { findMaps } from 'services/maps/maps_repo';

describe('maps repo', () => {
  it('can find maps', async () => {
    const result = await findMaps({ by: 'id', ids: ['2'] });
    expect(result.success).toBe(true);

    const maps = (result as Extract<typeof result, { success: true }>).value;
    expect(maps.length).toEqual(1);
    expect(maps[0].id).toEqual('2');
    expect(maps[0].title).toEqual('All Star 2');
    expect(maps[0].artist).toEqual('Smash Mouth 2');
  });
});
