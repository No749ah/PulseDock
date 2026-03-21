import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const makeService = () => ({
  getOrganizations: vi.fn(),
  createOrganization: vi.fn(),
  checkSlug: vi.fn(),
  acceptInvite: vi.fn(),
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  switchOrganization: vi.fn(),
  getMembers: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
});

const req = (userId = 'user-1') => ({ user: { sub: userId } } as never);

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(OrganizationsController);
  });

  it('getOrganizations — delegates to service', async () => {
    service.getOrganizations.mockResolvedValue([{ id: 'org-1' }]);
    const result = await controller.getOrganizations(req());
    expect(service.getOrganizations).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });

  it('createOrganization — passes dto to service', async () => {
    service.createOrganization.mockResolvedValue({ id: 'org-2' });
    const dto = { name: 'Acme', slug: 'acme' };
    const result = await controller.createOrganization(req(), dto as never);
    expect(service.createOrganization).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ id: 'org-2' });
  });

  it('checkSlug — returns availability', async () => {
    service.checkSlug.mockResolvedValue({ available: true });
    const result = await controller.checkSlug('my-org');
    expect(service.checkSlug).toHaveBeenCalledWith('my-org');
    expect(result).toEqual({ available: true });
  });

  it('acceptInvite — passes token and userId', async () => {
    service.acceptInvite.mockResolvedValue({ orgId: 'org-1' });
    await controller.acceptInvite(req(), 'tok-123');
    expect(service.acceptInvite).toHaveBeenCalledWith('tok-123', 'user-1');
  });

  it('getOrganization — passes id and userId', async () => {
    service.getOrganization.mockResolvedValue({ id: 'org-1', members: [] });
    await controller.getOrganization(req(), 'org-1');
    expect(service.getOrganization).toHaveBeenCalledWith('org-1', 'user-1');
  });

  it('updateOrganization — passes id, userId, dto', async () => {
    service.updateOrganization.mockResolvedValue({ id: 'org-1' });
    const dto = { name: 'Updated' };
    await controller.updateOrganization(req(), 'org-1', dto as never);
    expect(service.updateOrganization).toHaveBeenCalledWith('org-1', 'user-1', dto);
  });

  it('deleteOrganization — delegates to service', async () => {
    service.deleteOrganization.mockResolvedValue(undefined);
    await controller.deleteOrganization(req(), 'org-1');
    expect(service.deleteOrganization).toHaveBeenCalledWith('org-1', 'user-1');
  });

  it('switchOrganization — delegates to service', async () => {
    service.switchOrganization.mockResolvedValue(undefined);
    await controller.switchOrganization(req(), 'org-2');
    expect(service.switchOrganization).toHaveBeenCalledWith('org-2', 'user-1');
  });

  it('getMembers — returns member list', async () => {
    service.getMembers.mockResolvedValue([{ userId: 'u-2', role: 'MEMBER' }]);
    const result = await controller.getMembers(req(), 'org-1');
    expect(service.getMembers).toHaveBeenCalledWith('org-1', 'user-1');
    expect(result).toHaveLength(1);
  });

  it('inviteMember — passes id, userId, dto', async () => {
    service.inviteMember.mockResolvedValue({ invited: true });
    const dto = { email: 'new@example.com', role: 'MEMBER' };
    await controller.inviteMember(req(), 'org-1', dto as never);
    expect(service.inviteMember).toHaveBeenCalledWith('org-1', 'user-1', dto);
  });

  it('updateMemberRole — passes all params', async () => {
    service.updateMemberRole.mockResolvedValue({ role: 'ADMIN' });
    const dto = { role: 'ADMIN' };
    await controller.updateMemberRole(req(), 'org-1', 'user-2', dto as never);
    expect(service.updateMemberRole).toHaveBeenCalledWith('org-1', 'user-2', 'user-1', dto);
  });

  it('removeMember — delegates to service', async () => {
    service.removeMember.mockResolvedValue(undefined);
    await controller.removeMember(req(), 'org-1', 'user-2');
    expect(service.removeMember).toHaveBeenCalledWith('org-1', 'user-2', 'user-1');
  });
});
