#!/bin/bash
set -e

VERSION=$(bun -e "console.log(require('./package.json').version)")
TAG="v$VERSION"

echo "Releasing $TAG..."

git tag -a "$TAG" -m "Release $VERSION"
git push origin main
git push origin "$TAG"

echo "Tag $TAG pushed — GitHub Actions will build and release."
