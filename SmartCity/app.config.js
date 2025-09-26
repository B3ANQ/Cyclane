export default {
  expo: {
    name: "SmartCity",
    slug: "SmartCity",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    scheme: "smartcity",
    statusBar: {
      style: "auto",
      backgroundColor: "transparent"
    },
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.smartcity.app",
      scheme: "smartcity",
      infoPlist: {
        UIViewControllerBasedStatusBarAppearance: false,
        UIStatusBarStyle: "UIStatusBarStyleDefault",
        UIStatusBarHidden: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.smartcity.app",
      scheme: "smartcity"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router"
    ]
  }
};