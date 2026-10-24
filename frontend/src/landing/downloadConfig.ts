/**
 * Centralized Release Configuration & Verified Metadata for XakuMedia
 */

export interface ReleaseAssetInfo {
  version: string;
  releaseDate: string;
  githubRepo: string;
  githubOwner: string;
  releasesUrl: string;
  latestTag: string;
  installer: {
    filename: string;
    sizeFormatted: string;
    sizeBytes: number;
    downloadUrl: string;
  };
  portable: {
    filename: string;
    sizeFormatted: string;
    sizeBytes: number;
    downloadUrl: string;
  };
}

export const RELEASE_CONFIG: ReleaseAssetInfo = {
  version: "0.1.0",
  releaseDate: "October 2026",
  githubOwner: "Laykimhoung",
  githubRepo: "xakumedia-downloader",
  releasesUrl: "https://github.com/Laykimhoung/xakumedia-downloader/releases",
  latestTag: "v0.1.0",
  installer: {
    filename: "XakuMedia-Setup-0.1.0.exe",
    sizeFormatted: "167 MB",
    sizeBytes: 175267056,
    downloadUrl:
      "https://github.com/Laykimhoung/xakumedia-downloader/releases/download/v0.1.0/XakuMedia-Setup-0.1.0.exe",
  },
  portable: {
    filename: "XakuMedia-Portable-0.1.0.exe",
    sizeFormatted: "148 MB",
    sizeBytes: 155239572,
    downloadUrl:
      "https://github.com/Laykimhoung/xakumedia-downloader/releases/download/v0.1.0/XakuMedia-Portable-0.1.0.exe",
  },
};

export interface GitHubReleaseStatus {
  isChecking: boolean;
  isPublished: boolean;
  publishedAt?: string;
  tagName?: string;
  assetsAvailable: boolean;
}

/**
 * Check if the target GitHub release tag is already published.
 * Fails gracefully to pre-release state if offline, rate-limited, or tag is pending.
 */
export async function checkGitHubReleaseStatus(): Promise<GitHubReleaseStatus> {
  const url = `https://api.github.com/repos/${RELEASE_CONFIG.githubOwner}/${RELEASE_CONFIG.githubRepo}/releases/tags/${RELEASE_CONFIG.latestTag}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (response.status === 200) {
      const data = await response.json();
      const hasAssets =
        Array.isArray(data.assets) &&
        data.assets.some((a: { name: string }) =>
          a.name.endsWith(".exe")
        );
      return {
        isChecking: false,
        isPublished: true,
        publishedAt: data.published_at,
        tagName: data.tag_name,
        assetsAvailable: hasAssets,
      };
    }

    return {
      isChecking: false,
      isPublished: false,
      assetsAvailable: false,
    };
  } catch {
    return {
      isChecking: false,
      isPublished: false,
      assetsAvailable: false,
    };
  }
}
