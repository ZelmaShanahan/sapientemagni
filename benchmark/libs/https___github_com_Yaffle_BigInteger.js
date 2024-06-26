/*jslint plusplus: true, vars: true, indent: 2 */

(function (global) {
  "use strict";

  // BigInteger.js
  // Available under Public Domain
  // https://github.com/Yaffle/BigInteger/

  // For implementation details, see "The Handbook of Applied Cryptography"
  // http://www.cacr.math.uwaterloo.ca/hac/about/chap14.pdf

  var parseInteger = function (s, from, to, radix) {
    var i = from - 1;
    var n = 0;
    var y = radix < 10 ? radix : 10;
    while (++i < to) {
      var code = s.charCodeAt(i);
      var v = code - 48;
      if (v < 0 || y <= v) {
        v = 10 - 65 + code;
        if (v < 10 || radix <= v) {
          v = 10 - 97 + code;
          if (v < 10 || radix <= v) {
            throw new RangeError();
          }
        }
      }
      n = n * radix + v;
    }
    return n;
  };

  var createArray = function (length) {
    var x = new Array(length);
    var i = -1;
    while (++i < length) {
      x[i] = 0;
    }
    return x;
  };

  var epsilon = 2 / (9007199254740991 + 1);
  while (1 + epsilon / 2 !== 1) {
    epsilon /= 2;
  }
  var BASE = 2 / epsilon;
  var s = 134217728;
  while (s * s < 2 / epsilon) {
    s *= 2;
  }
  var SPLIT = s + 1;

  // Veltkamp-Dekker's algorithm
  // see http://web.mit.edu/tabbott/Public/quaddouble-debian/qd-2.3.4-old/docs/qd.pdf
  var fma = function (a, b, product) {
    var at = SPLIT * a;
    var ahi = at - (at - a);
    var alo = a - ahi;
    var bt = SPLIT * b;
    var bhi = bt - (bt - b);
    var blo = b - bhi;
    var error = ((ahi * bhi + product) + ahi * blo + alo * bhi) + alo * blo;
    return error;
  };

  var fastTrunc = function (x) {
    var v = (x - BASE) + BASE;
    return v > x ? v - 1 : v;
  };

  var performMultiplication = function (carry, a, b) {
    var product = a * b;
    var error = fma(a, b, -product);

    var hi = fastTrunc(product / BASE);
    var lo = product - hi * BASE + error;

    if (lo < 0) {
      lo += BASE;
      hi -= 1;
    }

    lo += carry - BASE;
    if (lo < 0) {
      lo += BASE;
    } else {
      hi += 1;
    }

    return {lo: lo, hi: hi};
  };

  var performDivision = function (a, b, divisor) {
    if (a >= divisor) {
      throw new RangeError();
    }
    var p = a * BASE;
    var q = fastTrunc(p / divisor);

    var r = 0 - fma(q, divisor, -p);
    if (r < 0) {
      q -= 1;
      r += divisor;
    }

    r += b - divisor;
    if (r < 0) {
      r += divisor;
    } else {
      q += 1;
    }
    var y = fastTrunc(r / divisor);
    r -= y * divisor;
    q += y;
    return {q: q, r: r};
  };

  function BigIntegerInternal(sign, magnitude, length) {
    this.sign = sign;
    this.magnitude = magnitude;
    this.length = length;
  }

  var createBigInteger = function (sign, magnitude, length) {
    return new BigIntegerInternal(sign, magnitude, length);
  };

  var fromNumber = function (n) {
    if (n >= BASE || 0 - n >= BASE) {
      throw new RangeError();
    }
    var a = createArray(1);
    a[0] = n < 0 ? 0 - n : 0 + n;
    return createBigInteger(n < 0 ? 1 : 0, a, n === 0 ? 0 : 1);
  };

  var fromString = function (s) {
    var length = s.length;
    if (length === 0) {
      throw new RangeError();
    }
    var sign = 0;
    var signCharCode = s.charCodeAt(0);
    var from = 0;
    if (signCharCode === 43) { // "+"
      from = 1;
    }
    if (signCharCode === 45) { // "-"
      from = 1;
      sign = 1;
    }
    var radix = 10;
    if (from === 0 && s.length >= 2 && s.charCodeAt(0) === 48) {
      if (s.charCodeAt(1) === 98) {
        radix = 2;
        from = 2;
      } else if (s.charCodeAt(1) === 111) {
        radix = 8;
        from = 2;
      } else if (s.charCodeAt(1) === 120) {
        radix = 16;
        from = 2;
      }
    }
    length -= from;
    if (length === 0) {
      throw new RangeError();
    }

    var groupLength = 0;
    var groupRadix = 1;
    var limit = fastTrunc(BASE / radix);
    while (groupRadix <= limit) {
      groupLength += 1;
      groupRadix *= radix;
    }

    var size = Math.floor((length - 1) / groupLength) + 1;
    var magnitude = createArray(size);
    var start = from + 1 + (length - 1 - (size - 1) * groupLength) - groupLength;

    var j = -1;
    while (++j < size) {
      var groupStart = start + j * groupLength;
      var c = parseInteger(s, (groupStart >= from ? groupStart : from), groupStart + groupLength, radix);
      var l = -1;
      while (++l < j) {
        var tmp = performMultiplication(c, magnitude[l], groupRadix);
        var lo = tmp.lo;
        var hi = tmp.hi;
        magnitude[l] = lo;
        c = hi;
      }
      magnitude[j] = c;
    }

    while (size > 0 && magnitude[size - 1] === 0) {
      size -= 1;
    }

    return createBigInteger(size === 0 ? 0 : sign, magnitude, size);
  };

  BigIntegerInternal.BigInt = function (x) {
    if (typeof x === "number") {
      return fromNumber(x);
    }
    if (typeof x === "string") {
      return fromString(x);
    }
    throw new RangeError();
  };

  var compareMagnitude = function (a, b) {
    if (a.length !== b.length) {
      return a.length < b.length ? -1 : +1;
    }
    var i = a.length;
    while (--i >= 0) {
      if (a.magnitude[i] !== b.magnitude[i]) {
        return a.magnitude[i] < b.magnitude[i] ? -1 : +1;
      }
    }
    return 0;
  };

  var compareTo = function (a, b) {
    var c = a.sign === b.sign ? compareMagnitude(a, b) : 1;
    return a.sign === 1 ? 0 - c : c; // positive zero will be returned for c === 0
  };

  var addAndSubtract = function (a, b, isSubtraction) {
    var z = compareMagnitude(a, b);
    var resultSign = z < 0 ? (isSubtraction !== 0 ? 1 - b.sign : b.sign) : a.sign;
    var min = z < 0 ? a : b;
    var max = z < 0 ? b : a;
    // |a| <= |b|
    if (min.length === 0) {
      return createBigInteger(resultSign, max.magnitude, max.length);
    }
    var subtract = 0;
    var resultLength = max.length;
    if (a.sign !== (isSubtraction !== 0 ? 1 - b.sign : b.sign)) {
      subtract = 1;
      if (min.length === resultLength) {
        while (resultLength > 0 && min.magnitude[resultLength - 1] === max.magnitude[resultLength - 1]) {
          resultLength -= 1;
        }
      }
      if (resultLength === 0) { // a === (-b)
        return createBigInteger(0, createArray(0), 0);
      }
    }
    // result !== 0
    var result = createArray(resultLength + (1 - subtract));
    var i = -1;
    var c = 0;
    while (++i < resultLength) {
      var aDigit = i < min.length ? min.magnitude[i] : 0;
      c += max.magnitude[i] + (subtract !== 0 ? 0 - aDigit : aDigit - BASE);
      if (c < 0) {
        result[i] = BASE + c;
        c = 0 - subtract;
      } else {
        result[i] = c;
        c = 1 - subtract;
      }
    }
    if (subtract === 0) {
      result[resultLength] = c;
      resultLength += c !== 0 ? 1 : 0;
    } else {
      while (resultLength > 0 && result[resultLength - 1] === 0) {
        resultLength -= 1;
      }
    }
    return createBigInteger(resultSign, result, resultLength);
  };

  BigIntegerInternal.lessThan = function (a, b) {
    return compareTo(a, b) < 0;
  };

  BigIntegerInternal.add = function (a, b) {
    return addAndSubtract(a, b, 0);
  };

  BigIntegerInternal.subtract = function (a, b) {
    return addAndSubtract(a, b, 1);
  };

  BigIntegerInternal.multiply = function (a, b) {
    if (a.length === 0 || b.length === 0) {
      return createBigInteger(0, createArray(0), 0);
    }
    if (a.length === 1 && a.magnitude[0] === 1) {
      return createBigInteger(a.sign === 1 ? 1 - b.sign : b.sign, b.magnitude, b.length);
    }
    if (b.length === 1 && b.magnitude[0] === 1) {
      return createBigInteger(a.sign === 1 ? 1 - b.sign : b.sign, a.magnitude, a.length);
    }
    var resultSign = a.sign === 1 ? 1 - b.sign : b.sign;
    var resultLength = a.length + b.length;
    var result = createArray(resultLength);
    var i = -1;
    while (++i < b.length) {
      if (b.magnitude[i] !== 0) { // to optimize multiplications by a power of BASE
        var c = 0;
        var j = -1;
        while (++j < a.length) {
          var carry = 0;
          c += result[j + i] - BASE;
          if (c >= 0) {
            carry = 1;
          } else {
            c += BASE;
          }
          var tmp = performMultiplication(c, a.magnitude[j], b.magnitude[i]);
          var lo = tmp.lo;
          var hi = tmp.hi;
          result[j + i] = lo;
          c = hi + carry;
        }
        result[a.length + i] = c;
      }
    }
    while (resultLength > 0 && result[resultLength - 1] === 0) {
      resultLength -= 1;
    }
    return createBigInteger(resultSign, result, resultLength);
  };

  var divideAndRemainder = function (a, b, isDivision) {
    if (b.length === 0) {
      throw new RangeError();
    }
    if (a.length === 0) {
      return createBigInteger(0, createArray(0), 0);
    }
    var quotientSign = a.sign === 1 ? 1 - b.sign : b.sign;
    if (b.length === 1 && b.magnitude[0] === 1) {
      if (isDivision !== 0) {
        return createBigInteger(quotientSign, a.magnitude, a.length);
      }
      return createBigInteger(0, createArray(0), 0);
    }

    var divisorOffset = a.length + 1; // `+ 1` for extra digit in case of normalization
    var divisorAndRemainder = createArray(divisorOffset + b.length + 1); // `+ 1` to avoid `index < length` checks
    var divisor = divisorAndRemainder;
    var remainder = divisorAndRemainder;
    var n = -1;
    while (++n < a.length) {
      remainder[n] = a.magnitude[n];
    }
    var m = -1;
    while (++m < b.length) {
      divisor[divisorOffset + m] = b.magnitude[m];
    }

    var top = divisor[divisorOffset + b.length - 1];

    // normalization
    var lambda = 1;
    if (b.length > 1) {
      lambda = fastTrunc(BASE / (top + 1));
      if (lambda > 1) {
        var carry = 0;
        var l = -1;
        while (++l < divisorOffset + b.length) {
          var tmp = performMultiplication(carry, divisorAndRemainder[l], lambda);
          var lo = tmp.lo;
          var hi = tmp.hi;
          divisorAndRemainder[l] = lo;
          carry = hi;
        }
        divisorAndRemainder[divisorOffset + b.length] = carry;
        top = divisor[divisorOffset + b.length - 1];
      }
      // assertion
      if (top < fastTrunc(BASE / 2)) {
        throw new RangeError();
      }
    }

    var shift = a.length - b.length + 1;
    if (shift < 0) {
      shift = 0;
    }
    var quotient = undefined;
    var quotientLength = 0;

    // to optimize divisions by a power of BASE
    var lastNonZero = 0;
    while (divisor[divisorOffset + lastNonZero] === 0) {
      lastNonZero += 1;
    }

    var i = shift;
    while (--i >= 0) {
      var t = b.length + i;
      var q = BASE - 1;
      if (remainder[t] !== top) {
        var tmp2 = performDivision(remainder[t], remainder[t - 1], top);
        var q2 = tmp2.q;
        //var r2 = tmp2.r;
        q = q2;
      }

      var ax = 0;
      var bx = 0;
      var j = i - 1 + lastNonZero;
      while (++j <= t) {
        var tmp3 = performMultiplication(bx, q, divisor[divisorOffset + j - i]);
        var lo3 = tmp3.lo;
        var hi3 = tmp3.hi;
        bx = hi3;
        ax += remainder[j] - lo3;
        if (ax < 0) {
          remainder[j] = BASE + ax;
          ax = -1;
        } else {
          remainder[j] = ax;
          ax = 0;
        }
      }
      while (ax !== 0) {
        q -= 1;
        var c = 0;
        var k = i - 1 + lastNonZero;
        while (++k <= t) {
          c += remainder[k] - BASE + divisor[divisorOffset + k - i];
          if (c < 0) {
            remainder[k] = BASE + c;
            c = 0;
          } else {
            remainder[k] = c;
            c = +1;
          }
        }
        ax += c;
      }
      if (isDivision !== 0 && q !== 0) {
        if (quotientLength === 0) {
          quotientLength = i + 1;
          quotient = createArray(quotientLength);
        }
        quotient[i] = q;
      }
    }

    if (isDivision !== 0) {
      if (quotientLength === 0) {
        return createBigInteger(0, createArray(0), 0);
      }
      return createBigInteger(quotientSign, quotient, quotientLength);
    }

    var remainderLength = a.length + 1;
    if (lambda > 1) {
      var r = 0;
      var p = remainderLength;
      while (--p >= 0) {
        var tmp4 = performDivision(r, remainder[p], lambda);
        var q4 = tmp4.q;
        var r4 = tmp4.r;
        remainder[p] = q4;
        r = r4;
      }
      if (r !== 0) {
        // assertion
        throw new RangeError();
      }
    }
    while (remainderLength > 0 && remainder[remainderLength - 1] === 0) {
      remainderLength -= 1;
    }
    if (remainderLength === 0) {
      return createBigInteger(0, createArray(0), 0);
    }
    var result = createArray(remainderLength);
    var o = -1;
    while (++o < remainderLength) {
      result[o] = remainder[o];
    }
    return createBigInteger(a.sign, result, remainderLength);
  };

  BigIntegerInternal.divide = function (a, b) {
    return divideAndRemainder(a, b, 1);
  };

  BigIntegerInternal.remainder = function (a, b) {
    return divideAndRemainder(a, b, 0);
  };

  BigIntegerInternal.unaryMinus = function (a) {
    return createBigInteger(a.length === 0 ? a.sign : 1 - a.sign, a.magnitude, a.length);
  };

  BigIntegerInternal.prototype.toString = function (radix) {
    if (radix == undefined) {
      radix = 10;
    }
    if (radix !== 10 && (radix < 2 || radix > 36 || radix !== Math.floor(radix))) {
      throw new RangeError("radix argument must be an integer between 2 and 36");
    }

    var a = this;
    var result = a.sign === 1 ? "-" : "";

    var remainderLength = a.length;
    if (remainderLength === 0) {
      return "0";
    }
    if (remainderLength === 1) {
      result += a.magnitude[0].toString(radix);
      return result;
    }
    var groupLength = 0;
    var groupRadix = 1;
    var limit = fastTrunc(BASE / radix);
    while (groupRadix <= limit) {
      groupLength += 1;
      groupRadix *= radix;
    }
    // assertion
    if (groupRadix * radix <= BASE) {
      throw new RangeError();
    }
    var size = remainderLength + Math.floor((remainderLength - 1) / groupLength) + 1;
    var remainder = createArray(size);
    var n = -1;
    while (++n < remainderLength) {
      remainder[n] = a.magnitude[n];
    }

    var k = size;
    while (remainderLength !== 0) {
      var groupDigit = 0;
      var i = remainderLength;
      while (--i >= 0) {
        var tmp = performDivision(groupDigit, remainder[i], groupRadix);
        var q = tmp.q;
        var r = tmp.r;
        remainder[i] = q;
        groupDigit = r;
      }
      while (remainderLength > 0 && remainder[remainderLength - 1] === 0) {
        remainderLength -= 1;
      }
      k -= 1;
      remainder[k] = groupDigit;
    }
    result += remainder[k].toString(radix);
    while (++k < size) {
      var t = remainder[k].toString(radix);
      var j = groupLength - t.length;
      while (--j >= 0) {
        result += "0";
      }
      result += t;
    }
    return result;
  };

  BigIntegerInternal.toNumber = function (a) {
    if (a.length === 0) {
      return 0;
    }
    if (a.length === 1) {
      return a.sign === 1 ? 0 - a.magnitude[0] : a.magnitude[0];
    }
    if (BASE + 1 !== BASE) {
      throw new RangeError();
    }
    var x = a.magnitude[a.length - 1];
    var y = a.magnitude[a.length - 2];
    var i = a.length - 3;
    while (i >= 0 && a.magnitude[i] === 0) {
      i -= 1;
    }
    if (i >= 0 && y % 2 === 1) {
      y += 1;
    }
    var z = (x * BASE + y) * Math.pow(BASE, a.length - 2);
    return a.sign === 1 ? 0 - z : z;
  };

  var exponentiateBigInt = function (a, b) {
    var n = Internal.toNumber(b);
    if (n < 0) {
      throw new RangeError();
    }
    if (n > 9007199254740991) {
      var y = Internal.toNumber(a);
      if (y === 0 || y === -1 || y === +1) {
        return Internal.BigInt(y === -1 && Internal.toNumber(Internal.remainder(b, Internal.BigInt(2))) === 0 ? +1 : y);
      }
      throw new RangeError();
    }
    var accumulator = Internal.BigInt(1);
    if (n > 0) {
      var x = a;
      while (n >= 2) {
        var t = Math.floor(n / 2);
        if (t * 2 !== n) {
          accumulator = Internal.multiply(accumulator, x);
        }
        n = t;
        x = Internal.multiply(x, x);
      }
      accumulator = Internal.multiply(accumulator, x);
    }
    return accumulator;
  };

  // noinline
  var n = function (f) {
    return function (x, y) {
      return f(x, y);
    };
  };

  var Internal = global.BigIntWrapper != undefined ? global.BigIntWrapper : BigIntegerInternal;

  var toNumber = n(function (a) {
    return Internal.toNumber(a);
  });
  var valueOf = function (x) {
    if (typeof x === "number") {
      return Internal.BigInt(x);
    }
    return x;
  };
  var toResult = function (x) {
    var value = Internal.toNumber(x);
    if (value >= -9007199254740991 && value <= +9007199254740991) {
      return value;
    }
    return x;
  };
  var add = n(function (x, y) {
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(Internal.add(a, b));
  });
  var subtract = n(function (x, y) {
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(Internal.subtract(a, b));
  });
  var multiply = n(function (x, y) {
    if (x === y) {
      var c = valueOf(x);
      return Internal.multiply(c, c);
    }
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(Internal.multiply(a, b));
  });
  var divide = n(function (x, y) {
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(Internal.divide(a, b));
  });
  var remainder = n(function (x, y) {
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(Internal.remainder(a, b));
  });
  var exponentiate = n(function (x, y) {
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(exponentiateBigInt(a, b));
  });
  var unaryMinus = n(function (x) {
    var a = valueOf(x);
    return Internal.unaryMinus(a);
  });
  var lessThan = n(function (x, y) {
    if (typeof x === "number") {
      return x < Internal.toNumber(y);
    }
    if (typeof y === "number") {
      return Internal.toNumber(x) < y;
    }
    return Internal.lessThan(x, y);
  });

  function BigInteger() {
  }

  // Conversion from String:
  // Conversion from Number:
  BigInteger.BigInt = function (x) {
    if (typeof x === "number") {
      return x;
    }
    var value = 0 + Number(x);
    if (value >= -9007199254740991 && value <= +9007199254740991) {
      return value;
    }
    return Internal.BigInt(x);
  };
  // Conversion to Number:
  BigInteger.toNumber = function (x) {
    if (typeof x === "number") {
      return x;
    }
    return toNumber(x);
  };

  // Arithmetic:
  BigInteger.add = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = x + y;
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return add(x, y);
  };
  BigInteger.subtract = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = x - y;
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return subtract(x, y);
  };
  BigInteger.multiply = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = 0 + x * y;
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return multiply(x, y);
  };
  BigInteger.divide = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      if (y !== 0) {
        return x === 0 ? 0 : (x > 0 && y > 0) || (x < 0 && y < 0) ? 0 + Math.floor(x / y) : 0 - Math.floor((0 - x) / y);
      }
    }
    return divide(x, y);
  };
  BigInteger.remainder = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      if (y !== 0) {
        return 0 + x % y;
      }
    }
    return remainder(x, y);
  };
  BigInteger.exponentiate = function (x, y) {
    if (typeof x === "number" && typeof y === "number" && y >= 0 && y < 53) { // Math.log2(9007199254740991 + 1)
      var value = 0 + Math.pow(x, y);
      if (value >= -9007199254740991 && value <= 9007199254740991) {
        return value;
      }
    }
    return exponentiate(x, y);
  };
  BigInteger.unaryMinus = function (x) {
    if (typeof x === "number") {
      return 0 - x;
    }
    return unaryMinus(x);
  };

  // Comparison:
  BigInteger.lessThan = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      return x < y;
    }
    return lessThan(x, y);
  };

  // Deprecated:
  BigInteger.compareTo = function (x, y) {
    return BigInteger.lessThan(x, y) ? -1 : (BigInteger.lessThan(y, x) ? +1 : 0);
  };
  BigInteger.negate = function (x) {
    return BigInteger.unaryMinus(x);
  };
  BigInteger.parseInt = function (string, radix) {
    return BigInteger.BigInt(radix == null || radix === 10 ? string : (radix === 2 ? "Ob" : (radix === 8 ? "0o" : (radix === 16 ? "0x" : ""))) + string);
  };

  global.BigInteger = BigInteger;

}(this));
