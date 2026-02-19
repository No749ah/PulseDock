import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: Array<'admin' | 'user'>) => SetMetadata('roles', roles);
