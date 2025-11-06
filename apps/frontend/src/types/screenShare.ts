export interface ScreenShare {
  userId: string;
  producerId: string;
  name: string;
  stream?: MediaStream; // For local reference
}

