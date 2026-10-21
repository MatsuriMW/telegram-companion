import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mediaEmbed } from "../src/utils/file";
import type { MessageUpdate } from "../src/type";

const photo = (width: number, height: number) =>
    ({
        photo: [
            { width: 90, height: 60 },
            { width, height },
        ],
    }) as unknown as MessageUpdate;
const plain = {} as MessageUpdate;

describe("mediaEmbed", () => {
    test("leaves the embed alone at 100%", () => {
        assert.equal(mediaEmbed("a.jpg", photo(1280, 720), 100), "![[a.jpg]]");
    });

    test("halves a picture narrower than the line by its own width", () => {
        assert.equal(mediaEmbed("a.jpg", photo(590, 1280), 50), "![[a.jpg|295]]");
    });

    test("halves a wide picture by the line width, the size it is actually shown at", () => {
        assert.equal(mediaEmbed("a.jpg", photo(1280, 720), 50), "![[a.jpg|350]]");
    });

    test("assumes an image sent as a file fills the line", () => {
        assert.equal(mediaEmbed("shot.PNG", plain, 50), "![[shot.PNG|350]]");
    });

    test("does not size files that are not images", () => {
        assert.equal(mediaEmbed("voice.ogg", plain, 50), "![[voice.ogg]]");
        assert.equal(mediaEmbed("paper.pdf", plain, 50), "![[paper.pdf]]");
    });

    test("ignores a scale that makes no sense", () => {
        assert.equal(mediaEmbed("a.jpg", photo(800, 600), 0), "![[a.jpg]]");
        assert.equal(mediaEmbed("a.jpg", photo(800, 600), Number.NaN), "![[a.jpg]]");
    });
});
