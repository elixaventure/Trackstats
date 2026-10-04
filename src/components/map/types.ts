export interface MapLine { id: string; coords: [number, number][]; color: string; width?: number; opacity?: number; dashed?: boolean }
export interface MapMarker { id: string; lngLat: [number, number]; label: string; color: string }
