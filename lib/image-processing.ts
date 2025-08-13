import { put } from "@vercel/blob";
import sharp from "sharp";

// 이미지를 WebP로 압축하고 Vercel Blob에 저장
export async function saveImageToBlob(
    imageBuffer: Buffer,
    userId: string,
    timestamp: string
): Promise<string> {
    try {
        console.log("=== 이미지 압축 및 Blob 저장 시작 ===");
        console.log("- 원본 이미지 크기:", imageBuffer.length, "bytes");

        // Sharp를 사용해 WebP로 변환 및 압축
        const compressedImage = await sharp(imageBuffer)
            .webp({
                quality: 80, // 품질 80% (파일 크기와 품질의 균형)
                effort: 6, // 압축 노력 수준 (0-6, 높을수록 더 많이 압축)
            })
            .resize({
                width: 1920, // 최대 가로 크기
                height: 1920, // 최대 세로 크기
                fit: "inside", // 비율 유지하면서 크기 조정
                withoutEnlargement: true, // 원본보다 크게 만들지 않음
            })
            .toBuffer();

        console.log("- 압축된 이미지 크기:", compressedImage.length, "bytes");
        console.log(
            "- 압축률:",
            Math.round(
                (1 - compressedImage.length / imageBuffer.length) * 100
            ) + "%"
        );

        // 파일명 생성 (userId_timestamp.webp)
        const filename = `attendance_${userId}_${Date.now()}.webp`;

        // Vercel Blob에 업로드
        const blob = await put(filename, compressedImage, {
            access: "public", // 공개 접근 허용
            contentType: "image/webp",
        });

        console.log("- Blob 업로드 성공:", blob.url);

        return blob.url;
    } catch (error) {
        console.error("이미지 Blob 저장 오류:", error);
        throw error;
    }
}

// 이미지 유효성 검증
export function validateImageBuffer(imageBuffer: Buffer): boolean {
    try {
        // 최소 크기 검증 (1KB)
        if (imageBuffer.length < 1024) {
            console.warn(
                "이미지 크기가 너무 작습니다:",
                imageBuffer.length,
                "bytes"
            );
            return false;
        }

        // 최대 크기 검증 (10MB)
        if (imageBuffer.length > 10 * 1024 * 1024) {
            console.warn(
                "이미지 크기가 너무 큽니다:",
                imageBuffer.length,
                "bytes"
            );
            return false;
        }

        // 이미지 시그니처 검증 (간단한 검증)
        const signature = imageBuffer.slice(0, 10).toString("hex");
        const isValidImage =
            signature.startsWith("ffd8ff") || // JPEG
            signature.startsWith("89504e47") || // PNG
            signature.startsWith("474946") || // GIF
            signature.startsWith("52494646") || // WEBP
            signature.startsWith("424d"); // BMP

        if (!isValidImage) {
            console.warn("지원하지 않는 이미지 형식입니다:", signature);
            return false;
        }

        return true;
    } catch (error) {
        console.error("이미지 유효성 검증 오류:", error);
        return false;
    }
}

// 이미지 메타데이터 추출
export async function extractImageMetadata(imageBuffer: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
}> {
    try {
        const metadata = await sharp(imageBuffer).metadata();

        return {
            width: metadata.width || 0,
            height: metadata.height || 0,
            format: metadata.format || "unknown",
            size: imageBuffer.length,
        };
    } catch (error) {
        console.error("이미지 메타데이터 추출 오류:", error);
        throw error;
    }
}
