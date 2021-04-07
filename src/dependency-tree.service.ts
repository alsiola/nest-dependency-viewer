import { INestApplication, Injectable, Scope } from "@nestjs/common";
import { NestContainer } from "@nestjs/core";
import { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import { sortBy, uniq } from "lodash";
import plantuml from "node-plantuml";
import { EOL } from "os";
import { Observable } from "rxjs";
import { Readable } from "stream";

function fromStream<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: Readable,
  finishEventName = "end",
  dataEventName = "data"
) {
  stream.pause();

  return new Observable<T>((observer) => {
    function dataHandler(data: T) {
      observer.next(data);
    }

    function errorHandler(err: unknown) {
      observer.error(err);
    }

    function endHandler() {
      observer.complete();
    }

    stream.addListener(dataEventName, dataHandler);
    stream.addListener("error", errorHandler);
    stream.addListener(finishEventName, endHandler);

    stream.resume();

    return () => {
      stream.removeListener(dataEventName, dataHandler);
      stream.removeListener("error", errorHandler);
      stream.removeListener(finishEventName, endHandler);
    };
  });
}

export enum DepType {
  Factory = "Factory",
  Connection = "Connection",
  Repository = "Repository",
  Import = "Import",
}

export type DepRecord = { name: string; type: DepType };
export type ProviderRecord = { name: string; deps: DepRecord[] };
export type ModuleRecord = {
  name: string;
  providers: ProviderRecord[];
};

export type DepTreeOpts = {
  focus?: string;
  ignoreProviders?: string[];
  ignoreModules?: string[];
  flattenDB?: boolean;
};

@Injectable({ scope: Scope.TRANSIENT })
export class DependencyTreeService {
  constructor(
    private readonly app: INestApplication,
    public readonly port: number
  ) {
    plantuml.useNailgun();
  }

  public getDependencyTree({
    focus,
    ignoreModules = [],
    ignoreProviders = [],
    flattenDB = false,
  }: DepTreeOpts) {
    const ignoredProviders = new Set(["ModuleRef", ...ignoreProviders]);
    const ignoredModules = new Set(["InternalCoreModule", ...ignoreModules]);
    const modules: ModuleRecord[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [, module] of ((this.app as any)
      .container as NestContainer).getModules()) {
      const providers: ProviderRecord[] = [];

      for (const [, provider] of module.providers) {
        providers.push({
          name: this.getProviderName(provider, flattenDB),
          deps: this.getProviderDeps(provider, flattenDB),
        });
      }

      for (const [, controller] of module.controllers) {
        providers.push({
          name: this.getProviderName(controller, flattenDB),
          deps: this.getProviderDeps(controller, flattenDB),
        });
      }

      const existingModule = modules.find(
        (m) => m.name === module.metatype.name
      );
      if (existingModule) {
        existingModule.providers.push(
          ...providers.filter(
            this.includeProvider({
              moduleName: module.metatype.name,
              ignoredProviders,
            })
          )
        );
      } else {
        modules.push({
          name: module.metatype.name,
          providers: providers.filter(
            this.includeProvider({
              moduleName: module.metatype.name,
              ignoredProviders,
            })
          ),
        });
      }
    }

    const includedModules = sortBy(
      modules.filter(this.includeModule({ focus, ignoredModules })),
      (m) => m.name
    );

    const allDeps = new Set(
      includedModules.flatMap((m) =>
        m.providers.flatMap((p) => p.deps.map((d) => d.name))
      )
    );

    return includedModules.map((m) => ({
      ...m,
      providers: m.providers.filter(
        (p) => allDeps.has(p.name) || focus === p.name
      ),
    }));
  }

  public getDependencyTreeImage({
    focus,
    ignoreModules = [],
    ignoreProviders = [],
  }: DepTreeOpts): Observable<Buffer> {
    const modules = this.getDependencyTree({
      focus,
      ignoreModules,
      ignoreProviders,
    });

    const uml = this.modulesToUML(modules);

    const gen = plantuml.generate(uml, {
      format: "svg",
    });

    return fromStream(gen.out);
  }

  private flattenDBRepos = (name: string, flatten: boolean) => {
    if (flatten && name.endsWith("Repository")) {
      return "DATABASE";
    }
    return name;
  };

  private includeProvider = ({
    moduleName,
    ignoredProviders,
  }: {
    moduleName: string;
    ignoredProviders: Set<string>;
  }) => (provider: ProviderRecord) =>
    provider.name &&
    !ignoredProviders.has(provider.name) &&
    provider.name !== moduleName;

  private includeModule = ({
    focus: moduleFocus,
    ignoredModules,
  }: {
    focus?: string;
    ignoredModules: Set<string>;
  }) => (module: ModuleRecord, _i: number, allModules: ModuleRecord[]) => {
    const baseIncludeModule =
      module.name &&
      !ignoredModules.has(module.name) &&
      module.providers.length > 0;

    if (!moduleFocus) {
      return baseIncludeModule;
    }

    if (module.providers.some((p) => p.name === moduleFocus)) {
      return true;
    }
    const focus = allModules.find((mod) =>
      mod.providers.find((prov) => prov.name === moduleFocus)
    );

    const focusDeps = focus?.providers
      .find((prov) => prov.name === moduleFocus)
      ?.deps.map((d) => d.name);

    if (!module.providers.some((prov) => focusDeps?.includes(prov.name))) {
      return false;
    }

    return baseIncludeModule;
  };

  private getProviderDeps(provider: InstanceWrapper, flattenDB: boolean) {
    return [
      ...Array.from(provider.getEnhancersMetadata() || []),
      ...Array.from(provider.getCtorMetadata() || []),
    ]
      .map((p) => ({
        name: (typeof p.name === "symbol"
          ? p.name.description
          : p.name
        ).toString(),
        p,
      }))
      .map(({ name, p }) => ({
        name: this.flattenDBRepos(name, flattenDB),
        type: name.endsWith("Repository")
          ? DepType.Repository
          : p.metatype?.name === "useFactory"
          ? DepType.Factory
          : name === "Connection"
          ? DepType.Connection
          : DepType.Import,
      }));
  }

  private getProviderName(provider: InstanceWrapper, flattenDB: boolean) {
    const name = (() => {
      if (provider.metatype?.name === "useFactory") {
        if (typeof provider.name === "symbol") {
          return provider.name.description;
        }

        return provider.name;
      }

      return provider.metatype?.name;
    })();
    return name && this.flattenDBRepos(name, flattenDB);
  }

  private modulesToUML(modules: ModuleRecord[]) {
    return `
      ${modules
        .map(
          (mod) => `package "${mod.name}" {
        ${mod.providers.map((provider) => `[${provider.name}]`).join(EOL)}
      }`
        )
        .join(EOL)}
  
        ${uniq(
          modules.flatMap((mod) =>
            mod.providers.flatMap((provider) =>
              provider.deps
                .filter((dep) =>
                  modules.find((m) =>
                    m.providers.some((p) => p.name === dep.name)
                  )
                )
                .map((dep) => `[${provider.name}] --> [${dep.name}]`)
            )
          )
        ).join(EOL)} 
    `;
  }
}
