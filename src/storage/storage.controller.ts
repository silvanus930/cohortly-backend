import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { type PresignedUpload, StorageService } from './storage.service';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('uploads')
  @ApiOperation({
    summary: 'Get a presigned PUT url for a personal upload such as an avatar or submission',
  })
  presign(
    @CurrentUser('id') userId: string,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignedUpload> {
    return this.storageService.createPresignedUpload({
      kind: dto.kind,
      folder: `uploads/${userId}`,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }
}
