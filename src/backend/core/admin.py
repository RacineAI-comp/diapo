from django.contrib import admin

from core.models import Presentation


@admin.register(Presentation)
class PresentationAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "owner", "created_at", "updated_at")
    search_fields = ("id", "title")
    readonly_fields = ("id", "created_at", "updated_at")
