# nest-dependency-viewer

Provides a web UI for examining the dependency tree of a NestJS application. Intended to run in development environments, on a separate port from the main application.

## Usage

Install with your package manager of choice:

```
yarn add nest-dependency-viewer
```

Create your main application first, then pass it to `DependencyTreeViewer.create`:

```
  // Your app setup
  const app = await NestFactory.create(AppModule);

  // Provide create method with the app to be examined, and the port on which *the dependency viewer* will be served
  const dependencyTreeViewerApp = await DependencyTreeViewer.create(app, 5001);

  // Start the viewer
  await dependencyTreeViewerApp.start(5001);
```
