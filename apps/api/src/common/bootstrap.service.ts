import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class BootstrapService implements OnModuleInit {
  async onModuleInit() {
    // First-run setup is handled via POST /v1/auth/setup
  }
}
