export type Toilet = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type MapViewport = {
  south: number;
  north: number;
  west: number;
  east: number;
  zoom: number;
};

export const MIN_TOILET_ZOOM = 14;

export type ToiletResponse = {
  items: Toilet[];
  zoomInRequired: boolean;
};
