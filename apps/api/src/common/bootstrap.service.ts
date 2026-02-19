import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { hashSync } from 'bcryptjs';
import { PrismaService } from './prisma.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const email = (process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@pulsedock.dev').toLowerCase();
    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';

    await this.prisma.user.create({
      data: {
        email,
        passwordHash: hashSync(password, 10),
        role: 'admin',
        isActive: true,
        mustChangePassword: true,
      },
    });

    this.logger.warn(`Seeded default admin user: ${email}`);
  }
}
