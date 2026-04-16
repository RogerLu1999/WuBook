const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeMathTextBase } = require('./server');

test('keeps fill-in underline runs unchanged', () => {
    assert.equal(normalizeMathTextBase('____'), '____');
    assert.equal(normalizeMathTextBase('请填写____答案____'), '请填写____答案____');
});

test('keeps escaped literal special characters', () => {
    assert.equal(normalizeMathTextBase('\\_ \\^ \\{ \\} \\\\'), '_ ^ { } \\');
});

test('still converts valid subscript/superscript expressions', () => {
    assert.equal(normalizeMathTextBase('x_1 + y^2'), 'x₁ + y²');
    assert.equal(normalizeMathTextBase('a_{12} + b^{3}'), 'a₁₂ + b³');
});

test('does not regress mixed underline and script content', () => {
    assert.equal(normalizeMathTextBase('设空格____，并计算x_2'), '设空格____，并计算x₂');
});
