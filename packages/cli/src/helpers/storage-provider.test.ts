import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	configureStorageProvider,
	getProviderFactoryName,
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

	it("derives an exported factory for every installable provider", async () => {
		const filesSdkDist = dirname(
			fileURLToPath(import.meta.resolve("files-sdk")),
		);
		for (const provider of INSTALLABLE_STORAGE_PROVIDERS) {
			const factory = getProviderFactoryName(provider);
			const declarations = await readFile(
				join(filesSdkDist, provider, "index.d.ts"),
				"utf8",
			);
			expect(
				declarations.includes(`const ${factory}`) ||
					declarations.includes(`as ${factory}`),
			).toBe(true);
		}
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

	it("removes only dependencies owned by the previous storage provider", async () => {
		const destination = await mkdtemp(join(tmpdir(), "chat-js-storage-"));
		try {
			await mkdir(join(destination, "lib"));
			await writeFile(
				join(destination, "package.json"),
				JSON.stringify({
					dependencies: {
						"@google-cloud/storage": "^7.19.0",
						"@vercel/blob": "2.4.0",
						"files-sdk": "2.1.0",
					},
				}),
			);
			await writeFile(
				join(destination, "lib", "storage-provider.ts"),
				'import { vercelBlob } from "files-sdk/vercel-blob";\n',
			);
			await writeFile(
				join(destination, ".env.example"),
				"# <chatjs-storage-provider>\n# </chatjs-storage-provider>\n",
			);

			await configureStorageProvider(destination, {
				provider: "s3",
				options: { bucket: "uploads", region: "us-east-1" },
			});

			const packageJson = JSON.parse(
				await readFile(join(destination, "package.json"), "utf8"),
			) as { dependencies: Record<string, string> };
			expect(packageJson.dependencies["@vercel/blob"]).toBeUndefined();
			expect(packageJson.dependencies["@google-cloud/storage"]).toBe("^7.19.0");
			expect(packageJson.dependencies["@aws-sdk/client-s3"]).toBe("^3.700.0");
			const providerSource = await readFile(
				join(destination, "lib", "storage-provider.ts"),
				"utf8",
			);
			expect(providerSource).toContain("satisfies Parameters<typeof s3>[0]");
		} finally {
			await rm(destination, { recursive: true, force: true });
		}
	});
});
