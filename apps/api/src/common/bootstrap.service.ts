import { Injectable, OnModuleInit } from '@nestjs/common';

/**
 * Bootstrap service that runs once when the NestJS application module initialises.
 *
 * First-run setup (creating the initial admin account, seeding default settings,
 * etc.) is initiated by the user via POST /v1/auth/setup rather than being run
 * automatically here. This keeps the setup flow explicit and auditable.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  /**
   * Called automatically by NestJS after all modules are initialised.
   * Currently a no-op — first-run setup is user-initiated via /v1/auth/setup.
   */
  async onModuleInit() {
    // First-run setup is handled via POST /v1/auth/setup
  }
}
