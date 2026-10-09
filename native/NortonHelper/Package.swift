// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "NortonHelper",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .executable(
            name: "NortonHelper",
            targets: ["NortonHelper"]
        )
    ],
    targets: [
        .executableTarget(
            name: "NortonHelper",
            dependencies: []
        )
    ]
)
