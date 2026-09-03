// Shared shape for providers that expose a dedicated image-search endpoint
// (as opposed to the general web-search RawSearchResult, which only
// occasionally carries an inline thumbnail). Real width/height here lets the
// quick-search resolution filter skip a network probe for these candidates.

export interface RawImageResult {
  imageUrl: string;
  sourceUrl: string;
  title: string;
  domain: string;
  width?: number;
  height?: number;
}
