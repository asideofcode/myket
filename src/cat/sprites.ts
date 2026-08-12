export type ClipName = "idle" | "walk" | "sit";

export type ClipMeta = {
  start: number;
  count: number;
  frameMs: number;
};

export type AtlasMeta = {
  frameWidth: number;
  frameHeight: number;
  image: string;
  clips: Record<ClipName, ClipMeta>;
};

export class SpriteAnimator {
  private img: HTMLImageElement;
  private meta: AtlasMeta;
  private clip: ClipName = "idle";
  private frame = 0;
  private elapsed = 0;
  private facing: 1 | -1 = 1;

  constructor(img: HTMLImageElement, meta: AtlasMeta) {
    this.img = img;
    this.meta = meta;
  }

  setClip(name: ClipName, reset = true) {
    if (this.clip === name && !reset) return;
    this.clip = name;
    if (reset) {
      this.frame = 0;
      this.elapsed = 0;
    }
  }

  getClip(): ClipName {
    return this.clip;
  }

  getFrame(): number {
    return this.frame;
  }

  setFacing(dir: 1 | -1) {
    this.facing = dir;
  }

  getFacing(): 1 | -1 {
    return this.facing;
  }

  update(dtMs: number) {
    const clip = this.meta.clips[this.clip];
    this.elapsed += dtMs;
    while (this.elapsed >= clip.frameMs) {
      this.elapsed -= clip.frameMs;
      this.frame = (this.frame + 1) % clip.count;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { frameWidth: fw, frameHeight: fh } = this.meta;
    const clip = this.meta.clips[this.clip];
    const atlasIndex = clip.start + this.frame;
    const sx = atlasIndex * fw;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, fw, fh);
    if (this.facing === -1) {
      ctx.translate(fw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.img, sx, 0, fw, fh, 0, 0, fw, fh);
    ctx.restore();
  }
}

export async function loadAtlas(
  baseUrl = "/sprites",
): Promise<{ img: HTMLImageElement; meta: AtlasMeta }> {
  const bust = `?v=${Date.now()}`;
  const metaRes = await fetch(`${baseUrl}/cat-atlas.json${bust}`);
  const meta = (await metaRes.json()) as AtlasMeta;
  const img = new Image();
  img.src = `${baseUrl}/${meta.image}${bust}`;
  await img.decode();
  return { img, meta };
}
