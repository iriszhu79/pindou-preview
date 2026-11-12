import { recognize, type Raster, type Geometry } from "./recognition";
self.onmessage = (
  event: MessageEvent<{ image: Raster; geometry?: Geometry }>,
) => {
  try {
    self.postMessage({
      result: recognize(event.data.image, event.data.geometry),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
