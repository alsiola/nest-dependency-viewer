import {
  Controller,
  Get,
  Header,
  ParseArrayPipe,
  ParseBoolPipe,
  Query,
  Render,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { ParsedUrlQueryInput, stringify } from "querystring";
import { map, reduce } from "rxjs/operators";
import { DependencyTreeService } from "./dependency-tree.service";

const version = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json")).toString()
).version;

@Controller("/deps")
export class DependencyTreeController {
  constructor(private readonly depTreeService: DependencyTreeService) {}

  @Get("/full.svg")
  @Header("Content-Type", "image/svg+xml")
  getFullImage(
    @Query("focus") focus?: string,
    @Query("ignoreModules", new ParseArrayPipe({ optional: true }))
    ignoreModules?: string[],
    @Query("flattenDB", ParseBoolPipe) flattenDB?: boolean
  ) {
    return this.depTreeService
      .getDependencyTreeImage({ focus, ignoreModules, flattenDB })

      .pipe(
        reduce((x, y) => Buffer.concat([x, y])),
        map((b) => b.toString())
      );
  }

  @Get()
  @Render("dep-select")
  getMainPage(@Req() request: Request) {
    const url = `${request.protocol}://${request.hostname}:${this.depTreeService.port}/deps`;
    const modules = this.depTreeService.getDependencyTree({});

    return {
      image_src:
        url + `/full.svg?` + stringify(request.query as ParsedUrlQueryInput),
      url,
      modules,
      version,
    };
  }
}
