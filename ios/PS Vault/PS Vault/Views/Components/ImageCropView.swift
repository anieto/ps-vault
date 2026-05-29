import SwiftUI

struct ImageCropView: View {
    let image: UIImage
    var onCancel: () -> Void
    var onCrop: (Data) -> Void

    @State private var scale: CGFloat = 1.0
    @State private var minScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            let cropRadius = min(geo.size.width, geo.size.height) * 0.42
            let totalOffset = CGSize(
                width: offset.width + gestureOffset.width,
                height: offset.height + gestureOffset.height
            )

            ZStack {
                Color.black.ignoresSafeArea()

                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale * gestureScale)
                    .offset(totalOffset)
                    .gesture(
                        SimultaneousGesture(
                            MagnificationGesture()
                                .updating($gestureScale) { value, state, _ in
                                    state = value
                                }
                                .onEnded { value in
                                    scale = max(minScale, scale * value)
                                },
                            DragGesture()
                                .updating($gestureOffset) { value, state, _ in
                                    state = value.translation
                                }
                                .onEnded { value in
                                    offset.width += value.translation.width
                                    offset.height += value.translation.height
                                }
                        )
                    )

                cropOverlay(geo: geo, cropRadius: cropRadius)
                    .allowsHitTesting(false)

                VStack {
                    HStack {
                        Button("Cancel") { onCancel() }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                        Spacer()
                        Button("Use Photo") {
                            if let data = cropImage(viewSize: geo.size, cropRadius: cropRadius) {
                                onCrop(data)
                            }
                        }
                        .foregroundStyle(.white)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                    }
                    Spacer()
                    Text("Pinch to zoom · Drag to reposition")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.6))
                        .padding(.bottom, 16)
                }
            }
            .onAppear {
                // Compute the minimum scale so the image always fills the crop circle.
                // UIImage.size already reflects display orientation.
                let cropDiameter = cropRadius * 2
                let fitScale = min(geo.size.width / image.size.width,
                                   geo.size.height / image.size.height)
                let displayMin = min(image.size.width * fitScale,
                                     image.size.height * fitScale)
                let computed = cropDiameter / displayMin
                minScale = max(1.0, computed)
                scale = minScale
            }
        }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func cropOverlay(geo: GeometryProxy, cropRadius: CGFloat) -> some View {
        let size = geo.size
        let cropRect = CGRect(
            x: size.width / 2 - cropRadius,
            y: size.height / 2 - cropRadius,
            width: cropRadius * 2,
            height: cropRadius * 2
        )
        ZStack {
            Path { path in
                path.addRect(CGRect(origin: .zero, size: size))
                path.addEllipse(in: cropRect)
            }
            .fill(.black.opacity(0.55), style: FillStyle(eoFill: true))
            .ignoresSafeArea()

            Circle()
                .strokeBorder(.white.opacity(0.7), lineWidth: 1.5)
                .frame(width: cropRadius * 2, height: cropRadius * 2)
        }
    }

    private func cropImage(viewSize: CGSize, cropRadius: CGFloat) -> Data? {
        let normalized = normalizedImage(image)
        let fitScale = min(viewSize.width / normalized.size.width,
                           viewSize.height / normalized.size.height)
        let displayScale = fitScale * scale
        let cropDiameter = cropRadius * 2
        let cropSizePixels = cropDiameter / displayScale
        let cropX = (-cropRadius - offset.width) / displayScale + normalized.size.width / 2
        let cropY = (-cropRadius - offset.height) / displayScale + normalized.size.height / 2

        let cropRect = CGRect(x: cropX, y: cropY, width: cropSizePixels, height: cropSizePixels)
        let imageRect = CGRect(origin: .zero, size: normalized.size)
        let clampedRect = cropRect.intersection(imageRect)

        guard !clampedRect.isNull,
              let cgImage = normalized.cgImage?.cropping(to: clampedRect) else { return nil }

        let outputSize = CGSize(width: 256, height: 256)
        let renderer = UIGraphicsImageRenderer(size: outputSize)
        let output = renderer.image { _ in
            UIImage(cgImage: cgImage).draw(in: CGRect(origin: .zero, size: outputSize))
        }
        return output.jpegData(compressionQuality: 0.8)
    }

    private func normalizedImage(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let renderer = UIGraphicsImageRenderer(size: image.size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}
