# Okanagan fire world sources

- Terrain grid: Natural Resources Canada, Canadian Digital Elevation Model, sampled through
  `https://geogratis.gc.ca/services/elevation/cdem/altitude` by
  `tools/terrain/fetch_okanagan_cdem.mjs`.
- Okanagan Lake shoreline: British Columbia Freshwater Atlas `FWA_LAKES_POLY`, simplified to
  simulation resolution and clipped to the committed terrain cell. The runtime polygon retains the
  Kelowna waterfront, west-side bays, and the Lake Country reach instead of using a hand-drawn
  valley strip.
- Kelowna International Airport: City of Kelowna YLW published field elevation and Runway 16/34
  dimensions. The parallel taxiway, terminal apron, and threshold layout are visual landmarks, not
  a current aerodrome chart.
- Forest composition: British Columbia Vegetation Resources Inventory, Forest Vegetation
  Composite Rank 1 layer. The first playable cell uses the observed interior stand vocabulary and
  the CWFIS C7/O1/M1 fuel-class mapping; it does not claim tree-by-tree survey accuracy.
- Population and occupied dwellings: Statistics Canada 2021 Census profiles for Kelowna, West
  Kelowna, Peachland, and Lake Country.
- Fire behaviour vocabulary: Canadian Forest Fire Behaviour Prediction System. The runtime is a
  deterministic game-scale spread surrogate, not an operational fire forecast.
- Aircraft: Air Tractor published 3,104 L Fire Boss capacity and 1,700 shp/173 kt ferry figures;
  Wipaire published the twin hydraulic scoop arrangement and approximately one-second actuation.

The fire itself is a fictional training incident. It is deliberately not a recreation of a named
fatal or destructive Okanagan wildfire.
