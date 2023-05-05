export interface SunburstData {
  id: string;
  name: string;
  value?: number;
  data?: SunburstData;
  children?: Array<SunburstData>;
}

