import { pusherChannelsFor } from './pusher.service';


describe('pusherChannelsFor', () => {
  it('subscribes platform admins only to the platform channel', () => {
    expect(pusherChannelsFor({
      is_platform_admin: true,
      tenant_id: null,
      tenant_role: null,
    })).toEqual(['private-platform']);
  });

  it('subscribes drivers to their tenant and driver channels', () => {
    expect(pusherChannelsFor({
      is_platform_admin: false,
      tenant_id: 'tenant-1',
      tenant_role: 'driver',
    })).toEqual(['private-tenant-tenant-1', 'private-drivers']);
  });

  it('does not expose the driver channel to other tenants', () => {
    expect(pusherChannelsFor({
      is_platform_admin: false,
      tenant_id: 'tenant-2',
      tenant_role: 'vendor',
    })).toEqual(['private-tenant-tenant-2']);
  });
});
