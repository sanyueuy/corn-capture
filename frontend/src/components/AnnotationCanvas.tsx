import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { getAnnotationColor } from "../annotationDisplay";
import type { AnnotationBox } from "../types";


type AnnotationCanvasProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  boxes: AnnotationBox[];
  selectedBoxId: string | null;
  onChange: (boxes: AnnotationBox[]) => void;
  onSelect: (boxId: string | null) => void;
};

type DraftBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type EditableRectProps = {
  box: AnnotationBox;
  boxIndex: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onChange: (nextBox: AnnotationBox) => void;
  imageWidth: number;
  imageHeight: number;
};


function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}


function constrainBox(box: Pick<AnnotationBox, "x_px" | "y_px" | "w_px" | "h_px">, imageWidth: number, imageHeight: number) {
  const minSize = 4;
  const x = clamp(box.x_px, 0, imageWidth - minSize);
  const y = clamp(box.y_px, 0, imageHeight - minSize);
  const width = clamp(box.w_px, minSize, imageWidth - x);
  const height = clamp(box.h_px, minSize, imageHeight - y);

  return {
    x_px: x,
    y_px: y,
    w_px: width,
    h_px: height,
  };
}


function createClientBox(box: AnnotationBox): AnnotationBox {
  return {
    ...box,
    id: box.id ?? crypto.randomUUID(),
  };
}


function EditableRect({
  box,
  boxIndex,
  selected,
  disabled,
  onSelect,
  onChange,
  imageWidth,
  imageHeight,
}: EditableRectProps) {
  const shapeRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const color = getAnnotationColor(boxIndex);
  const labelWidth = 28;
  const labelHeight = 22;
  const labelX = clamp(box.x_px, 0, Math.max(0, imageWidth - labelWidth));
  const labelY = box.y_px >= labelHeight + 6 ? box.y_px - labelHeight - 6 : box.y_px + 6;

  useEffect(() => {
    if (selected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  return (
    <>
      <Group>
        <Rect
          x={box.x_px}
          y={box.y_px}
          width={box.w_px}
          height={box.h_px}
          stroke="rgba(255, 255, 255, 0.96)"
          strokeWidth={selected ? 6 : 4}
          listening={false}
        />
        <Rect
          ref={shapeRef}
          x={box.x_px}
          y={box.y_px}
          width={box.w_px}
          height={box.h_px}
          stroke={color.stroke}
          strokeWidth={selected ? 3.5 : 2.5}
          fill={selected ? color.fill : color.softFill}
          shadowColor={color.shadow}
          shadowBlur={selected ? 16 : 8}
          shadowOpacity={selected ? 0.9 : 0.45}
          draggable={!disabled}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(event) => {
            const constrained = constrainBox(
              {
                x_px: event.target.x(),
                y_px: event.target.y(),
                w_px: box.w_px,
                h_px: box.h_px,
              },
              imageWidth,
              imageHeight,
            );
            onChange({
              ...box,
              ...constrained,
            });
          }}
          onTransformEnd={() => {
            const node = shapeRef.current;
            if (!node) {
              return;
            }

            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            const nextBox = constrainBox(
              {
                x_px: node.x(),
                y_px: node.y(),
                w_px: node.width() * scaleX,
                h_px: node.height() * scaleY,
              },
              imageWidth,
              imageHeight,
            );

            node.scaleX(1);
            node.scaleY(1);
            node.x(nextBox.x_px);
            node.y(nextBox.y_px);
            node.width(nextBox.w_px);
            node.height(nextBox.h_px);

            onChange({
              ...box,
              ...nextBox,
            });
          }}
        />
        <Rect
          x={labelX}
          y={labelY}
          width={labelWidth}
          height={labelHeight}
          cornerRadius={999}
          fill={color.stroke}
          shadowColor={color.shadow}
          shadowBlur={8}
          shadowOpacity={0.4}
          listening={false}
        />
        <Text
          x={labelX}
          y={labelY + 4}
          width={labelWidth}
          align="center"
          text={String(boxIndex + 1)}
          fontSize={12}
          fontStyle="bold"
          fill="#FFFFFF"
          listening={false}
        />
      </Group>
      {selected ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          flipEnabled={false}
          keepRatio={false}
          centeredScaling={false}
          borderStroke={color.stroke}
          borderStrokeWidth={2}
          anchorFill={color.stroke}
          anchorStroke="#FFFFFF"
          anchorStrokeWidth={2}
          anchorSize={12}
          anchorCornerRadius={999}
          enabledAnchors={[
            "top-center",
            "middle-left",
            "middle-right",
            "bottom-center",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          boundBoxFunc={(oldBox, nextBox) => {
            if (nextBox.width < 4 || nextBox.height < 4) {
              return oldBox;
            }
            if (nextBox.x < 0 || nextBox.y < 0) {
              return oldBox;
            }
            if (nextBox.x + nextBox.width > imageWidth || nextBox.y + nextBox.height > imageHeight) {
              return oldBox;
            }
            return nextBox;
          }}
        />
      ) : null}
    </>
  );
}


export function AnnotationCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  boxes,
  selectedBoxId,
  onChange,
  onSelect,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 960, height: 640 });
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);

  useEffect(() => {
    const image = new window.Image();
    image.src = imageUrl;
    image.onload = () => setLoadedImage(image);
    return () => {
      image.onload = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setContainerSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(420, Math.floor(entry.contentRect.height)),
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDraftBox(null);
  }, [imageUrl]);

  const fitScale = useMemo(() => {
    if (!imageWidth || !imageHeight) {
      return 1;
    }
    return Math.min(containerSize.width / imageWidth, containerSize.height / imageHeight);
  }, [containerSize.height, containerSize.width, imageHeight, imageWidth]);

  const displayScale = fitScale * zoom;
  const offsetX = (containerSize.width - imageWidth * displayScale) / 2 + pan.x;
  const offsetY = (containerSize.height - imageHeight * displayScale) / 2 + pan.y;

  const canStartDrawing = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const className = event.target.getClassName();
    return className === "Stage" || className === "Image";
  };

  const screenToImage = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const point = stage.getPointerPosition();
    if (!point) {
      return null;
    }

    return {
      x: clamp((point.x - offsetX) / displayScale, 0, imageWidth),
      y: clamp((point.y - offsetY) / displayScale, 0, imageHeight),
    };
  };

  const updateBox = (id: string, nextBox: AnnotationBox) => {
    onChange(
      boxes.map((box) => {
        if (box.id !== id) {
          return box;
        }
        return {
          ...nextBox,
          id,
          x_px: clamp(nextBox.x_px, 0, imageWidth),
          y_px: clamp(nextBox.y_px, 0, imageHeight),
          w_px: clamp(nextBox.w_px, 1, imageWidth - clamp(nextBox.x_px, 0, imageWidth)),
          h_px: clamp(nextBox.h_px, 1, imageHeight - clamp(nextBox.y_px, 0, imageHeight)),
        };
      }),
    );
  };

  const finalizeDraft = () => {
    if (!draftBox) {
      return;
    }

    const x = Math.min(draftBox.startX, draftBox.currentX);
    const y = Math.min(draftBox.startY, draftBox.currentY);
    const width = Math.abs(draftBox.currentX - draftBox.startX);
    const height = Math.abs(draftBox.currentY - draftBox.startY);
    setDraftBox(null);

    if (width < 6 || height < 6) {
      return;
    }

    const newBox = createClientBox({
      class_id: 0,
      x_px: x,
      y_px: y,
      w_px: width,
      h_px: height,
      plant_height_cm: null,
    });
    onChange([...boxes, newBox]);
    onSelect(newBox.id ?? null);
  };

  return (
    <div className="canvas-shell">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-group">
          <button type="button" onClick={() => setZoom((current) => clamp(current - 0.1, 0.3, 4))}>
            缩小
          </button>
          <button type="button" onClick={() => setZoom((current) => clamp(current + 0.1, 0.3, 4))}>
            放大
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            重置视图
          </button>
        </div>
        <div className="canvas-toolbar-group">
          <button
            type="button"
            className={panMode ? "is-active" : ""}
            onClick={() => setPanMode((current) => !current)}
          >
            {panMode ? "平移模式" : "绘框模式"}
          </button>
          <span className="canvas-meta">缩放 {Math.round(zoom * 100)}%</span>
        </div>
      </div>
      <p className="canvas-hint">拖拽可移动框，边和角的控制点都可以自由调整宽高。</p>

      <div className="canvas-stage" ref={containerRef}>
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          draggable={panMode && !draftBox}
          onDragEnd={(event) => {
            setPan({
              x: event.target.x(),
              y: event.target.y(),
            });
            event.target.position({ x: 0, y: 0 });
          }}
          onWheel={(event) => {
            event.evt.preventDefault();
            const delta = event.evt.deltaY > 0 ? -0.1 : 0.1;
            setZoom((current) => clamp(current + delta, 0.3, 4));
          }}
          onMouseDown={(event) => {
            if (panMode || !canStartDrawing(event)) {
              return;
            }
            const nextPoint = screenToImage(event);
            if (!nextPoint) {
              return;
            }
            setDraftBox({
              startX: nextPoint.x,
              startY: nextPoint.y,
              currentX: nextPoint.x,
              currentY: nextPoint.y,
            });
            onSelect(null);
          }}
          onMouseMove={(event) => {
            if (!draftBox) {
              return;
            }
            const nextPoint = screenToImage(event);
            if (!nextPoint) {
              return;
            }
            setDraftBox({
              ...draftBox,
              currentX: nextPoint.x,
              currentY: nextPoint.y,
            });
          }}
          onMouseUp={finalizeDraft}
          onTouchStart={(event) => {
            if (panMode || !canStartDrawing(event)) {
              return;
            }
            const nextPoint = screenToImage(event);
            if (!nextPoint) {
              return;
            }
            setDraftBox({
              startX: nextPoint.x,
              startY: nextPoint.y,
              currentX: nextPoint.x,
              currentY: nextPoint.y,
            });
            onSelect(null);
          }}
          onTouchMove={(event) => {
            if (!draftBox) {
              return;
            }
            const nextPoint = screenToImage(event);
            if (!nextPoint) {
              return;
            }
            setDraftBox({
              ...draftBox,
              currentX: nextPoint.x,
              currentY: nextPoint.y,
            });
          }}
          onTouchEnd={finalizeDraft}
        >
          <Layer>
            <Group x={offsetX} y={offsetY} scaleX={displayScale} scaleY={displayScale}>
              {loadedImage ? (
                <KonvaImage
                  image={loadedImage}
                  width={imageWidth}
                  height={imageHeight}
                  onClick={() => {
                    if (!draftBox) {
                      onSelect(null);
                    }
                  }}
                />
              ) : null}

              {boxes.map((box, index) => (
                <EditableRect
                  key={box.id}
                  box={box}
                  boxIndex={index}
                  selected={selectedBoxId === box.id}
                  disabled={panMode}
                  onSelect={() => onSelect(box.id ?? null)}
                  onChange={(nextBox) => updateBox(box.id ?? "", nextBox)}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                />
              ))}

              {draftBox ? (
                <Rect
                  x={Math.min(draftBox.startX, draftBox.currentX)}
                  y={Math.min(draftBox.startY, draftBox.currentY)}
                  width={Math.abs(draftBox.currentX - draftBox.startX)}
                  height={Math.abs(draftBox.currentY - draftBox.startY)}
                  stroke="#8AB17D"
                  strokeWidth={2}
                  dash={[8, 6]}
                />
              ) : null}
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
