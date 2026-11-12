import {
  recognize,
  GridDetectionError,
  validateGeometry,
  type Raster,
  type Geometry,
} from "./recognition";
self.onmessage = (
  event: MessageEvent<{ image: Raster; geometry?: Geometry }>,
) => {
  let geometryValid = false;
  try {
    if (event.data.geometry) {
      validateGeometry(event.data.image, event.data.geometry);
      geometryValid = true;
    }
    self.postMessage({
      result: recognize(event.data.image, event.data.geometry),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      kind:
        error instanceof GridDetectionError
          ? error.diagnostics.bestCandidate
            ? "geometry-uncertain"
            : "grid-not-detected"
          : event.data.geometry && !geometryValid
            ? "geometry-invalid"
            : "classification-failed",
      diagnostics:
        error instanceof GridDetectionError ? error.diagnostics : undefined,
    });
  }
};
