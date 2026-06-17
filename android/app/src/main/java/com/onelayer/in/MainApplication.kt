package com.onelayer.`in`

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

/**
 * Pure React Native CLI MainApplication.
 * All Expo module references (ReactNativeHostWrapper, ApplicationLifecycleDispatcher,
 * expo.modules.*) have been removed.
 */
class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    // Manually add packages that cannot be autolinked here if needed
                }

            /**
             * IMPORTANT: must match the name registered in index.js via AppRegistry.
             * index.js → AppRegistry.registerComponent(appName, ...) where appName = "srn_mobile"
             */
            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        DefaultNewArchitectureEntryPoint.releaseLevel = try {
            ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
        } catch (e: IllegalArgumentException) {
            ReleaseLevel.STABLE
        }
        loadReactNative(this)
    }
}
