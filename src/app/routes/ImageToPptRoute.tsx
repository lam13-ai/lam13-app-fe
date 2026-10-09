import { useEffect } from 'react';
import { ImageToPptView } from '@/features/presentations';

/** `/image-to-ppt` */
export default function ImageToPptRoute() {
  useEffect(() => {
    document.title = 'Image to PPT · Lam13';
  }, []);
  return <ImageToPptView />;
}
