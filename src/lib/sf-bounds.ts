/** SF county (city) approximate bounding box — main land area, excludes Farallons. Safe to use in client and server. */
export const SF_COUNTY_BBOX = {
  south: 37.708,
  north: 37.832,
  west: -122.515,
  east: -122.355,
} as const;

/** Bay Area extent for map maxBounds — restricts pan/zoom to the region. */
export const BAY_AREA_BBOX = {
  south: 37.25,
  north: 38.15,
  west: -122.65,
  east: -121.8,
} as const;
