import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { AccessEntity } from "../../entities/access.entity";
import { Repository, getConnection } from "typeorm";
import { MenusListVo } from "../../controllers/menus/vo/menus.vo";
import { ICurrentUserType } from "../../../../../../decorators/current.user";
import { AdminIdentityEnum, AccessTypeEnum } from "../../../../../../enums";
import { AccountRoleEntity } from "../../../account/entities/account.role.entity";
import { RoleAccessEntity } from "../../../role/entities/role.access.entity";

interface IAccessList {
  id: number;
  moduleName: string;
  actionName: string;
  parentId: number;
  url: string;
  sort: number;
  icon: string;
}

@Injectable()
export class MenusService {
  private readonly logger: Logger = new Logger(MenusService.name);

  constructor(
    @InjectRepository(AccessEntity)
    private readonly accessRepository: Repository<AccessEntity>,
    @InjectRepository(AccountRoleEntity)
    private readonly accountRoleRepository: Repository<AccountRoleEntity>
  ) {
  }

  /**
   * @Author: 水痕
   * @Date: 2021-03-24 14:43:40
   * @LastEditors: 水痕
   * @Description: 获取菜单列表
   * @param {ICurrentUserType} userInfo
   * @return {*}
   */
  async menusList(userInfo: ICurrentUserType): Promise<MenusListVo[]> {
    /**
     * 根据用户权限来返回菜单
     * 1.查询全部的菜单
     * 2.如果是超级管理员就返回全部菜单
     * 3.非超级管理员，根据当前用户拥有的角色去查询(角色资源)表获取全部的资源
     */
    const { id, isSuper } = userInfo;
    // 超级管理员就全部返回
    if (Object.is(isSuper, AdminIdentityEnum.SUPPER)) {
      // 1.查询全部的菜单(模块和菜单)
      const accessList: AccessEntity[] = await this.accessRepository.find({
        where: [
          { type: AccessTypeEnum.MODULE },
          { type: AccessTypeEnum.MENUS }
        ]
      });
      // 1.1格式化菜单
      return this.formatMenus(accessList);
    } else {
      // 2.根据当前账号id查询已经授权的角色
      const authRoleList: Pick<AccountRoleEntity, "roleId">[] =
        await this.accountRoleRepository.find({
          where: { accountId: id },
          select: ["roleId"]
        });
      const authRoleIdList: number[] = authRoleList.map(
        (item: Pick<AccountRoleEntity, "roleId">) => item.roleId
      );
      console.log(authRoleList, "授权的角色列表", authRoleIdList);
      // 3.根据角色ID列表获取当前账号拥有的资源id
      const authAccessList: Pick<RoleAccessEntity, "accessId">[] =
        await getConnection()
          .createQueryBuilder(RoleAccessEntity, "role_access")
          .select(["role_access.accessId"])
          .where(
            "role_access.roleId in (:...roleId) and role_access.type = 2",
            {
              roleId: authRoleIdList
            }
          )
          .getMany();
      this.logger.log("授权的资源列表", authAccessList); // [ RoleAccessEntity { accessId: 5 } ]
      const authAccessIdList: number[] = authAccessList.map(
        (item: Pick<RoleAccessEntity, "accessId">) => item.accessId
      );
      // 4.根据资源id去查询菜单并且格式化返回
      const accessList: Extract<AccessEntity, IAccessList>[] =
        await getConnection()
          .createQueryBuilder(AccessEntity, "access")
          .select([
            "access.id",
            "access.moduleName",
            "access.actionName",
            "access.parentId",
            "access.url",
            "access.sort",
            "access.icon"
          ])
          .where(
            "(access.id in (:...authAccessIdList) and (access.type = 1 or access.type = 2))",
            {
              authAccessIdList
            }
          )
          .getMany();
      return this.formatMenus(accessList);
    }
  }

  /**
   * @Author: 水痕
   * @Date: 2021-04-07 16:45:11
   * @LastEditors: 水痕
   * @Description: 格式化返回菜单
   * @param {AccessEntity} accessList
   * @return {*}
   */
  private formatMenus(accessList: IAccessList[]): MenusListVo[] {
    return accessList.map((item: IAccessList) => {
      const { id, moduleName, actionName, parentId, url, sort, icon } = item;
      return {
        id,
        name: moduleName ? moduleName : actionName,
        parentId,
        url,
        sort,
        icon
      };
    });
  }
}
