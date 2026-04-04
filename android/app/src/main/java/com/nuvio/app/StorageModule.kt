package com.nuvio.app

import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "StorageModule"

    @ReactMethod
    fun isExternalStorageManager(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            promise.resolve(Environment.isExternalStorageManager())
        } else {
            // Pre-Android 11: WRITE_EXTERNAL_STORAGE is sufficient
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getStorageVolumes(promise: Promise) {
        try {
            val storageManager = reactApplicationContext.getSystemService(Context.STORAGE_SERVICE) as StorageManager
            val result = Arguments.createArray()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val volumes = storageManager.storageVolumes
                for (volume in volumes) {
                    val volumeMap = Arguments.createMap()
                    val description = volume.getDescription(reactApplicationContext) ?: "Unknown"
                    val isPrimary = volume.isPrimary
                    val isRemovable = volume.isRemovable
                    val state = volume.state

                    volumeMap.putString("description", description)
                    volumeMap.putBoolean("isPrimary", isPrimary)
                    volumeMap.putBoolean("isRemovable", isRemovable)
                    volumeMap.putString("state", state)

                    // Get the actual path
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        val dir = volume.directory
                        if (dir != null) {
                            volumeMap.putString("path", dir.absolutePath)
                        } else {
                            volumeMap.putNull("path")
                        }
                    } else {
                        // For API < 30, use reflection to get the path
                        try {
                            val getPath = volume.javaClass.getMethod("getPath")
                            val path = getPath.invoke(volume) as? String
                            volumeMap.putString("path", path)
                        } catch (e: Exception) {
                            if (isPrimary) {
                                volumeMap.putString("path", Environment.getExternalStorageDirectory().absolutePath)
                            } else {
                                volumeMap.putNull("path")
                            }
                        }
                    }

                    // Only include mounted volumes with valid paths
                    if (state == Environment.MEDIA_MOUNTED) {
                        result.pushMap(volumeMap)
                    }
                }
            } else {
                // Fallback for very old APIs: just return primary storage
                val volumeMap = Arguments.createMap()
                volumeMap.putString("description", "Internal Storage")
                volumeMap.putBoolean("isPrimary", true)
                volumeMap.putBoolean("isRemovable", false)
                volumeMap.putString("state", Environment.getExternalStorageState())
                volumeMap.putString("path", Environment.getExternalStorageDirectory().absolutePath)
                result.pushMap(volumeMap)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", "Failed to get storage volumes: ${e.message}", e)
        }
    }
}
