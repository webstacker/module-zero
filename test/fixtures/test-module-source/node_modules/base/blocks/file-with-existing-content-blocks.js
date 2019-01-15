/*! m0-start */
function testFnA(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
function testFnB(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
function testFnC(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
function testFnD(a, b, c) {
    return [a, b, c];
}
/*! m0-end */

/*! m0-start */
const config = {
    testFnA,
    testFnB,
    testFnC,
    testFnD
};
/*! m0-end */

/*! m0-start */
module.export = config;
/*! m0-end */
