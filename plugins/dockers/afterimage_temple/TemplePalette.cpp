// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TemplePalette.h"
#include <QtGlobal>
#include <cmath>

namespace {
double clamp(double value, double low = 0, double high = 1) { return qBound(low, value, high); }
double encoded(double value) { return value <= .0031308 ? 12.92 * value : 1.055 * std::pow(value, 1.0 / 2.4) - .055; }
struct Rgb { double r, g, b; };
Rgb linearRgb(double light, double chroma, double hue) {
    const double radians = hue * 3.14159265358979323846 / 180.0;
    const double a = chroma * std::cos(radians), b = chroma * std::sin(radians);
    const double l = std::pow(light + .3963377774 * a + .2158037573 * b, 3);
    const double m = std::pow(light - .1055613458 * a - .0638541728 * b, 3);
    const double s = std::pow(light - .0894841775 * a - 1.291485548 * b, 3);
    return {4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
        -.0041960863 * l - .7034186147 * m + 1.707614701 * s};
}
bool inside(Rgb value) {
    return value.r >= -1e-7 && value.r <= 1.0000001 && value.g >= -1e-7 && value.g <= 1.0000001
        && value.b >= -1e-7 && value.b <= 1.0000001;
}
int fromOklch(double light, double chroma, double hue) {
    light = clamp(light); chroma = clamp(chroma, 0, .5);
    Rgb rgb = linearRgb(light, chroma, hue);
    if (!inside(rgb)) {
        double low = 0, high = chroma;
        for (int i = 0; i < 24; ++i) {
            const double mid = (low + high) / 2;
            if (inside(linearRgb(light, mid, hue))) low = mid; else high = mid;
        }
        rgb = linearRgb(light, low, hue);
    }
    const int r = std::round(clamp(encoded(clamp(rgb.r))) * 255);
    const int g = std::round(clamp(encoded(clamp(rgb.g))) * 255);
    const int b = std::round(clamp(encoded(clamp(rgb.b))) * 255);
    return r * 65536 + g * 256 + b;
}
}

QJsonArray TemplePalette::generate(const QString &relationship, double hue, double chroma, double contrast, bool darkGround) {
    const double pressure = clamp(contrast), c = clamp(chroma, 0, .3);
    double offsets[3] = {-28, 0, 28};
    if (relationship == "mono") { offsets[0] = 0; offsets[1] = 0; offsets[2] = 0; }
    else if (relationship == "complementary") { offsets[0] = 0; offsets[1] = 180; offsets[2] = 10; }
    else if (relationship == "split") { offsets[0] = 0; offsets[1] = 150; offsets[2] = 210; }
    else if (relationship == "triadic") { offsets[0] = 0; offsets[1] = 120; offsets[2] = 240; }
    else if (relationship == "tension") { offsets[0] = 0; offsets[1] = 180; offsets[2] = 155; }
    const double levels[3] = {relationship == "tension" ? .61 : .38 + .08 * (1 - pressure),
        relationship == "tension" ? .62 : .60, relationship == "tension" ? .65 : .72 + .20 * pressure};
    QJsonArray colors;
    for (int i = 0; i < 3; ++i) colors.append(fromOklch(levels[i], c * (i == 2 ? .65 : 1), hue + offsets[i]));
    colors.append(fromOklch(darkGround ? .12 + .14 * (1 - pressure) : .97 - .09 * (1 - pressure), c * .12, hue + 15));
    return colors;
}
