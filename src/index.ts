import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { DependencyTreeModule } from "./dependency-tree.module";

export class DependencyTreeViewer {
  static async create(parentApp: INestApplication, port: number) {
    const app = await NestFactory.create<NestExpressApplication>(
      DependencyTreeModule.withApp(parentApp, port)
    );

    app.setBaseViewsDir(join(__dirname, "..", "views"));
    app.setViewEngine("hbs");

    await app.listen(port);

    return app;
  }
}
