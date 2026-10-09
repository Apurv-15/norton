// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "NortonSecurityExtension",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .executable(
            name: "NortonSecurityExtension",
            targets: ["NortonSecurityExtension"]
        )
    ],
    targets: [
        .executableTarget(
            name: "NortonSecurityExtension",
            dependencies: [],
            linkerSettings: [
                .linkedLibrary("endpointsecurity")
            ]
        )
    ]
)
