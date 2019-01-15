/*! m0-start */
function testFn1(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
function testFn2(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
function testFn3(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
function testFn4(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
const config = {
    testFn1,
    testFn2,
    testFn3,
    testFn4
};
/*! m0-end */

function testFn5() {}

config.testFn5 = testFn5;

/*! m0-start */
module.export = config;
/*! m0-end */
