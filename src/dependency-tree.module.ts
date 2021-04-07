import { DynamicModule, INestApplication } from '@nestjs/common';
import { DependencyTreeController } from './dependency-tree.controller';
import { DependencyTreeService } from './dependency-tree.service';

export class DependencyTreeModule {
  static withApp(app: INestApplication, port: number): DynamicModule {
    return {
      module: DependencyTreeModule,
      providers: [
        {
          provide: DependencyTreeService,
          useFactory: () => new DependencyTreeService(app, port),
        },
      ],
      controllers: [DependencyTreeController],
    };
  }
}
