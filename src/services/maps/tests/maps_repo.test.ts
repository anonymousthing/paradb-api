import { _unwrap } from 'base/result';
import { deleteMap, findMaps, getMap, GetMapError } from 'services/maps/maps_repo';
import { setFavorites } from 'services/users/favorites_repo';
import { createUser } from 'services/users/users_repo';

describe('maps repo', () => {
  it('can find maps', async () => {
    const result = await getMap('2');
    expect(result.success).toBe(true);

    const map = (result as Extract<typeof result, { success: true }>).value;
    expect(map.id).toEqual('2');
    expect(map.title).toEqual('All Star 2');
    expect(map.artist).toEqual('Smash Mouth 2');
  });

  it('can delete a map', async () => {
    const deleteResult = await deleteMap('2');
    expect(deleteResult.success).toBe(true);

    const getResult = await getMap('2');
    expect(getResult.success).toBe(false);
    expect((getResult as Extract<typeof getResult, { success: false }>).errors).toEqual([{
      type: GetMapError.MISSING_MAP,
    }]);
  });

  it('can delete a map that has favorites', async () => {
    const userResult = await _unwrap(
      createUser({
        email: 'test_email@test.com',
        username: 'test_user',
        password: 'NotAWeakPassword917',
      }),
    );
    const favoriteResult = await setFavorites(userResult.id, ['2'], true);
    expect(favoriteResult.success).toBe(true);
    const deleteResult = await deleteMap('2');
    expect(deleteResult.success).toBe(true);

    const getResult = await getMap('2');
    expect(getResult.success).toBe(false);
    expect((getResult as Extract<typeof getResult, { success: false }>).errors).toEqual([{
      type: GetMapError.MISSING_MAP,
    }]);
  });
});
