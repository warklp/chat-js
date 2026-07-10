import { describe, expect, it } from "bun:test";
import {
	INSTALLABLE_STORAGE_PROVIDERS,
	parseStorageOptions,
	resolveStorageProvider,
	storageEnvRequirements,
} from "./storage-provider";

describe("storage provider configuration", () => {
	it("accepts every provider compatible with a generated Next.js app", () => {
		for (const provider of INSTALLABLE_STORAGE_PROVIDERS) {
			expect(resolveStorageProvider(provider)).toBe(provider);
		}
		expect(() => resolveStorageProvider("bun-s3")).toThrow("Unknown");
		expect(() => resolveStorageProvider("convex")).toThrow("Unknown");
		expect(() => resolveStorageProvider("memory")).toThrow("Unknown");
	});

	it("does not require credentials resolved by a provider SDK chain", () => {
		expect(storageEnvRequirements("s3")).toEqual([
			{
				description: "S3 configuration",
				options: [["AWS_REGION"]],
			},
		]);
		expect(storageEnvRequirements("gcs")).toEqual([]);
		expect(storageEnvRequirements("s3", { region: "us-east-1" })).toEqual([]);
	});

	it("parses adapter options as an object", () => {
		expect(parseStorageOptions('{"bucket":"uploads"}')).toEqual({
			bucket: "uploads",
		});
		expect(() => parseStorageOptions("[]")).toThrow("JSON object");
	});

	it("derives Vercel Blob credential alternatives from the catalog", () => {
		expect(storageEnvRequirements("vercel-blob")).toEqual([
			{
				description: "Vercel Blob credentials",
				options: [
					["BLOB_READ_WRITE_TOKEN"],
					["VERCEL_OIDC_TOKEN", "BLOB_STORE_ID"],
				],
			},
		]);
	});
});
