export type SearchResult = {
  title: string;
  address: string;
  lat: number;
  lng: number;
  kind: "place" | "address";
};

export type SearchResponse = {
  items: SearchResult[];
  warning?: string;
};
